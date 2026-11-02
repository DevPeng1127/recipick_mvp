// @vitest-environment node
import type { AxiosInstance } from 'axios'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const origin = 'http://localhost'
const server = setupServer()
let client: AxiosInstance
let navigate = vi.fn<(path: string) => void>()

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function setTokens(access = 'expired-access', refresh = 'valid-refresh') {
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', '')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  })
  navigate = vi.fn<(path: string) => void>()
  vi.stubGlobal('window', { location: { set href(value: string) { navigate(value) } } })
  const { default: axios } = await import('axios')
  axios.defaults.baseURL = origin
  client = (await import('../api/client')).default
  client.defaults.baseURL = `${origin}/api/v1`
  setTokens()
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('API authentication refresh', () => {
  it('uses the production API origin for the original request, refresh, and retry', async () => {
    const productionOrigin = 'https://recipick-api.example.test'
    vi.stubEnv('VITE_API_BASE_URL', ` ${productionOrigin}/api/v1/ `)
    vi.resetModules()
    const productionClient = (await import('../api/client')).default
    const calls: string[] = []
    server.use(
      http.get(`${productionOrigin}/api/v1/users/me`, ({ request }) => {
        calls.push(request.url)
        return request.headers.get('authorization') === 'Bearer production-access'
          ? HttpResponse.json({ id: 7 })
          : new HttpResponse(null, { status: 401 })
      }),
      http.post(`${productionOrigin}/api/v1/auth/refresh`, async ({ request }) => {
        calls.push(request.url)
        expect(await request.json()).toEqual({ refresh_token: 'valid-refresh' })
        return HttpResponse.json({ access_token: 'production-access', refresh_token: 'production-refresh' })
      }),
    )
    expect((await productionClient.get('/users/me')).data).toEqual({ id: 7 })
    expect(calls).toEqual([
      `${productionOrigin}/api/v1/users/me`,
      `${productionOrigin}/api/v1/auth/refresh`,
      `${productionOrigin}/api/v1/users/me`,
    ])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shares one refresh across concurrent requests and preserves each request when retrying', async () => {
    const releaseRefresh = deferred()
    const refreshStarted = deferred()
    let refreshCalls = 0
    const attempts: { method: string; auth: string | null; url: string; body: string }[] = []
    server.use(
      http.all(`${origin}/api/v1/items`, async ({ request }) => {
        attempts.push({ method: request.method, auth: request.headers.get('authorization'), url: request.url, body: await request.text() })
        return request.headers.get('authorization') === 'Bearer renewed-access'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse(null, { status: 401 })
      }),
      http.post(`${origin}/api/v1/auth/refresh`, async ({ request }) => {
        refreshCalls++
        expect(await request.json()).toEqual({ refresh_token: 'valid-refresh' })
        refreshStarted.resolve()
        await releaseRefresh.promise
        return HttpResponse.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' })
      }),
    )
    const result = Promise.allSettled([
      client.get('/items', { params: { page: 2 } }),
      client.post('/items', { quantity: 2 }),
      client.patch('/items', { name: '사과' }),
    ])
    await refreshStarted.promise
    releaseRefresh.resolve()
    expect((await result).map((entry) => entry.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    expect(refreshCalls).toBe(1)
    expect(attempts).toHaveLength(6)
    for (const method of ['GET', 'POST', 'PATCH']) {
      const [initial, retry] = attempts.filter((entry) => entry.method === method)
      expect(retry).toEqual({ ...initial, auth: 'Bearer renewed-access' })
    }
    expect(localStorage.getItem('access_token')).toBe('renewed-access')
    expect(localStorage.getItem('refresh_token')).toBe('renewed-refresh')
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each([false, true])('reuses a completed refresh for a late 401 (identical tokens: %s)', async (sameTokens) => {
    const lateRequestStarted = deferred()
    const releaseLateResponse = deferred()
    let refreshCalls = 0
    const resourceCalls = new Map<string, number>()
    server.use(
      http.get(`${origin}/api/v1/:resource`, async ({ request, params }) => {
        const resource = String(params.resource)
        const calls = (resourceCalls.get(resource) ?? 0) + 1
        resourceCalls.set(resource, calls)
        if (calls > 1) {
          expect(request.headers.get('authorization')).toBe(`Bearer ${sameTokens ? 'expired-access' : 'renewed-access'}`)
          return HttpResponse.json({ ok: true })
        }
        if (params.resource === 'late') {
          lateRequestStarted.resolve()
          await releaseLateResponse.promise
        }
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(`${origin}/api/v1/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json(sameTokens
          ? { access_token: 'expired-access', refresh_token: 'valid-refresh' }
          : { access_token: 'renewed-access', refresh_token: 'renewed-refresh' })
      }),
    )
    const late = client.get('/late')
    await lateRequestStarted.promise
    await client.get('/first')
    releaseLateResponse.resolve()
    await expect(late).resolves.toMatchObject({ status: 200 })
    expect(refreshCalls).toBe(1)
  })

  it.each([401, 503, 'network', 'malformed'] as const)('rejects all waiting requests and redirects once on refresh failure: %s', async (failure) => {
    const releaseRefresh = deferred()
    const refreshStarted = deferred()
    let refreshCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${origin}/api/v1/auth/refresh`, async () => {
        refreshCalls++
        refreshStarted.resolve()
        await releaseRefresh.promise
        if (failure === 'network') return HttpResponse.error()
        if (failure === 'malformed') return HttpResponse.json({ access_token: ' ' })
        return new HttpResponse(null, { status: failure })
      }),
    )
    const result = Promise.allSettled([client.get('/items'), client.get('/items'), client.get('/items')])
    await refreshStarted.promise
    releaseRefresh.resolve()
    expect((await result).map((entry) => entry.status)).toEqual(['rejected', 'rejected', 'rejected'])
    expect(refreshCalls).toBe(1)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('does not restore tokens when logout happens during refresh', async () => {
    const refreshStarted = deferred()
    const releaseRefresh = deferred()
    let resourceCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, () => {
        resourceCalls++
        return resourceCalls === 1 ? new HttpResponse(null, { status: 401 }) : HttpResponse.json({ ok: true })
      }),
      http.post(`${origin}/api/v1/auth/refresh`, async () => {
        refreshStarted.resolve()
        await releaseRefresh.promise
        return HttpResponse.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' })
      }),
    )
    const result = Promise.allSettled([client.get('/items')])
    await refreshStarted.promise
    localStorage.clear()
    releaseRefresh.resolve()
    expect((await result)[0].status).toBe('rejected')
    expect(resourceCalls).toBe(1)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('clears stale access tokens when no refresh token is available', async () => {
    localStorage.removeItem('refresh_token')
    server.use(http.get(`${origin}/api/v1/items`, () => new HttpResponse(null, { status: 401 })))
    await expect(client.get('/items')).rejects.toMatchObject({ response: { status: 401 } })
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it.each([200, 401])('preserves a new login when the old refresh returns %s', async (status) => {
    const refreshStarted = deferred()
    const releaseRefresh = deferred()
    let resourceCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, () => {
        resourceCalls++
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(`${origin}/api/v1/auth/refresh`, async () => {
        refreshStarted.resolve()
        await releaseRefresh.promise
        return HttpResponse.json({ access_token: 'old-session-access', refresh_token: 'old-session-refresh' }, { status })
      }),
    )
    const result = Promise.allSettled([client.get('/items')])
    await refreshStarted.promise
    setTokens('new-user-access', 'new-user-refresh')
    releaseRefresh.resolve()
    expect((await result)[0].status).toBe('rejected')
    expect(resourceCalls).toBe(1)
    expect(localStorage.getItem('access_token')).toBe('new-user-access')
    expect(localStorage.getItem('refresh_token')).toBe('new-user-refresh')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not retry an old 401 using a different login', async () => {
    const requestStarted = deferred()
    const releaseResponse = deferred()
    let resourceCalls = 0
    server.use(http.get(`${origin}/api/v1/items`, async () => {
      resourceCalls++
      requestStarted.resolve()
      await releaseResponse.promise
      return new HttpResponse(null, { status: 401 })
    }))
    const result = Promise.allSettled([client.get('/items')])
    await requestStarted.promise
    setTokens('new-user-access', 'new-user-refresh')
    releaseResponse.resolve()
    expect((await result)[0].status).toBe('rejected')
    expect(resourceCalls).toBe(1)
    expect(localStorage.getItem('access_token')).toBe('new-user-access')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stops after one retry when the renewed token also receives 401', async () => {
    let resourceCalls = 0
    let refreshCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, () => {
        resourceCalls++
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(`${origin}/api/v1/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json({ access_token: 'invalid-access', refresh_token: 'renewed-refresh' })
      }),
    )
    await expect(client.get('/items')).rejects.toMatchObject({ response: { status: 401 } })
    expect(resourceCalls).toBe(2)
    expect(refreshCalls).toBe(1)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it.each([403, 500, 'network'] as const)('passes through %s without changing the session or refreshing', async (status) => {
    server.use(http.get(`${origin}/api/v1/items`, () => status === 'network'
      ? HttpResponse.error() : new HttpResponse(null, { status })))
    await expect(client.get('/items')).rejects.toBeDefined()
    expect(localStorage.getItem('access_token')).toBe('expired-access')
    expect(localStorage.getItem('refresh_token')).toBe('valid-refresh')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('allows a later expiration to refresh again using the rotated refresh token', async () => {
    const refreshTokens: unknown[] = []
    let expectedAccess = 'access-1'
    server.use(
      http.get(`${origin}/api/v1/items`, ({ request }) => request.headers.get('authorization') === `Bearer ${expectedAccess}`
        ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 })),
      http.post(`${origin}/api/v1/auth/refresh`, async ({ request }) => {
        refreshTokens.push(await request.json())
        return HttpResponse.json({ access_token: expectedAccess, refresh_token: `refresh-${refreshTokens.length}` })
      }),
    )
    await client.get('/items')
    expectedAccess = 'access-2'
    await client.get('/items')
    expect(refreshTokens).toEqual([{ refresh_token: 'valid-refresh' }, { refresh_token: 'refresh-1' }])
    expect(localStorage.getItem('access_token')).toBe('access-2')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('lets a new login refresh normally after a previous refresh failure', async () => {
    let refreshCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, ({ request }) => request.headers.get('authorization') === 'Bearer renewed-access'
        ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 })),
      http.post(`${origin}/api/v1/auth/refresh`, () => {
        refreshCalls++
        return refreshCalls === 1 ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' })
      }),
    )
    await expect(client.get('/items')).rejects.toBeDefined()
    setTokens('new-login-access', 'new-login-refresh')
    await expect(client.get('/items')).resolves.toMatchObject({ status: 200 })
    expect(refreshCalls).toBe(2)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('does not cancel another waiting request when one caller aborts', async () => {
    const refreshStarted = deferred()
    const releaseRefresh = deferred()
    const controller = new AbortController()
    let refreshCalls = 0
    server.use(
      http.get(`${origin}/api/v1/items`, ({ request }) => request.headers.get('authorization') === 'Bearer renewed-access'
        ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 })),
      http.post(`${origin}/api/v1/auth/refresh`, async () => {
        refreshCalls++
        refreshStarted.resolve()
        await releaseRefresh.promise
        return HttpResponse.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' })
      }),
    )
    const result = Promise.allSettled([client.get('/items', { signal: controller.signal }), client.get('/items')])
    await refreshStarted.promise
    controller.abort()
    releaseRefresh.resolve()
    const [cancelled, successful] = await result
    expect(cancelled).toMatchObject({ status: 'rejected', reason: { code: 'ERR_CANCELED' } })
    expect(successful.status).toBe('fulfilled')
    expect(refreshCalls).toBe(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not recursively refresh when an explicit refresh request fails', async () => {
    let refreshCalls = 0
    server.use(http.post(`${origin}/api/v1/auth/refresh`, () => {
      refreshCalls++
      return new HttpResponse(null, { status: 401 })
    }))
    await expect(client.post('/auth/refresh', { refresh_token: 'valid-refresh' })).rejects.toBeDefined()
    expect(refreshCalls).toBe(1)
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('settles waiting requests if the refresh server never responds', async () => {
    const { default: axios } = await import('axios')
    // Exercise Axios' real timeout path with a short test-only deadline.
    const post = vi.spyOn(axios, 'post').mockImplementation((url, data, config) =>
      axios.request({ ...config, url, data, method: 'post', timeout: 50 }))
    const releaseRefresh = deferred()
    server.use(
      http.get(`${origin}/api/v1/items`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${origin}/api/v1/auth/refresh`, async () => {
        await releaseRefresh.promise
        return HttpResponse.json({ access_token: 'too-late', refresh_token: 'too-late' })
      }),
    )
    try {
      const results = await Promise.allSettled([client.get('/items'), client.get('/items')])
      expect(results.map((entry) => entry.status)).toEqual(['rejected', 'rejected'])
      expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/refresh', { refresh_token: 'valid-refresh' }, { timeout: 30_000 })
      expect(localStorage.getItem('access_token')).toBeNull()
      expect(localStorage.getItem('refresh_token')).toBeNull()
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
    } finally {
      releaseRefresh.resolve()
    }
  })
})
