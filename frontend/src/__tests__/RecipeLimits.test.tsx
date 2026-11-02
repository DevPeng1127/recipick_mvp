import { MemoryRouter } from 'react-router-dom'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecipePage from '../pages/RecipePage'
import { useRecipeStore } from '../stores/useRecipeStore'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import * as recipeApi from '../api/recipes'
import * as fridgeApi from '../api/refrigerators'

vi.mock('../api/recipes')
vi.mock('../api/refrigerators')

beforeEach(() => {
  vi.resetAllMocks()
  useRecipeStore.setState(useRecipeStore.getInitialState(), true)
  useRefrigeratorStore.setState(useRefrigeratorStore.getInitialState(), true)
  vi.mocked(recipeApi.getMenuInventory).mockResolvedValue({ as_of: '2026-10-30', ingredients: [{ ingredient_id: 100, name: '당근', quantity: 1, unit: '개', expiry_date: null, expiry_source: 'unknown', refrigerator_id: 10, refrigerator_name: '테스트 냉장고', storage_box_name: '채소칸' }] })
  vi.mocked(fridgeApi.listRefrigerators).mockResolvedValue([{
    id: 10, name: '테스트 냉장고', created_at: '', role: 'OWNER', is_favorite: false,
    top_ingredients: [], total_ingredient_count: 2,
  }])
})
afterEach(cleanup)

function limited(message: string, retryAt: string | null = null) {
  return { isAxiosError: true, response: { status: 429, data: { detail: {
    code: 'user_minute_limit', message, retry_at: retryAt,
  } } } }
}

describe('Recipe rate limits through page and store', () => {
  it('does not display or auto-retry an inconsistent menu and recovers on manual retry', async () => {
    vi.mocked(recipeApi.recommendRecipe)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 502, data: {
        detail: { code: 'inconsistent_menu', message: 'private provider response' },
      } } })
      .mockResolvedValueOnce({ recipe: '사용 재료: 당근 0.5개. 당근을 볶습니다.' })
    render(<MemoryRouter><RecipePage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /테스트 냉장고/ }))
    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('결과를 저장하지 않았습니다')
    expect(screen.queryByText(/private provider/)).toBeNull()
    expect(screen.queryByRole('button', { name: '먹은 항목 확인 · 스마트 차감' })).toBeNull()
    expect(useRecipeStore.getState()).toMatchObject({ recipe: '', planId: null, isLoading: false })
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))
    expect(await screen.findByText(/당근을 볶습니다/)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(2)
  })

  it('restores the current cooking plan when returning through the recipes link', async () => {
    useRecipeStore.setState({ recipe: '이전 레시피', planId: 'saved-plan' })
    vi.mocked(recipeApi.getCookingPreview).mockResolvedValue({
      plan_id: 'saved-plan', title: '저장된 요리', recipe: '서버 레시피', servings: 1,
      requirements: [], stock: [], suggestions: [], applied_at: null, result: null,
    })
    render(<MemoryRouter initialEntries={['/recipes']}><RecipePage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: '먹은 항목 확인 · 스마트 차감' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '저장된 요리' })).toBeVisible()
    expect(recipeApi.getCookingPreview).toHaveBeenCalledWith('saved-plan')
    expect(recipeApi.recommendRecipe).not.toHaveBeenCalled()
  })

  it('defaults to one serving and sends the selected serving count', async () => {
    vi.mocked(recipeApi.recommendRecipe).mockResolvedValue({ recipe: '추천 내용' })
    render(<MemoryRouter><RecipePage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /테스트 냉장고/ }))
    expect(screen.getByLabelText('인분')).toHaveValue('1')
    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))
    await waitFor(() => expect(recipeApi.recommendRecipe).toHaveBeenCalledWith([10], 1, []))
    await user.selectOptions(screen.getByLabelText('인분'), '8')
    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))
    await waitFor(() => expect(recipeApi.recommendRecipe).toHaveBeenLastCalledWith([10], 8, []))
  })

  it('shows the reason and Korean retry time, then allows a manual retry', async () => {
    vi.mocked(recipeApi.recommendRecipe)
      .mockRejectedValueOnce(limited('오늘의 레시피 추천 횟수를 모두 사용했습니다.', '2026-10-19T15:00:00Z'))
      .mockResolvedValueOnce({ recipe: '## 두부 구이\n맛있는 레시피입니다.' })
    render(<MemoryRouter><RecipePage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /테스트 냉장고/ }))
    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('오늘의 레시피 추천 횟수를 모두 사용했습니다.')
    expect(alert).toHaveTextContent('10월 20일')
    expect(alert).toHaveTextContent('00:00:00')
    expect(alert).toHaveTextContent('한국 시간')
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /AI 메뉴 추천받기/ })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /AI 메뉴 추천받기/ }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/맛있는 레시피입니다/)).toBeVisible()
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(2)
  })

  it.each([
    '현재 추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    '이미 레시피를 만들고 있습니다. 완료 후 다시 요청해 주세요.',
    'AI 제공자의 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  ])('shows a limit without inventing a retry time: %s', async (message) => {
    vi.mocked(recipeApi.recommendRecipe).mockRejectedValueOnce(limited(message))
    await useRecipeStore.getState().fetchRecipe([10])
    expect(useRecipeStore.getState().error).toBe(message)
    expect(useRecipeStore.getState().isLoading).toBe(false)
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(1)
  })

  it('prevents two requests even before React rerenders', async () => {
    let resolveRequest!: (value: { recipe: string }) => void
    vi.mocked(recipeApi.recommendRecipe).mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))
    const first = useRecipeStore.getState().fetchRecipe([10])
    await useRecipeStore.getState().fetchRecipe([10])
    expect(recipeApi.recommendRecipe).toHaveBeenCalledTimes(1)
    expect(useRecipeStore.getState().isLoading).toBe(true)
    await act(async () => {
      resolveRequest({ recipe: 'Recipe' })
      await first
    })
    expect(useRecipeStore.getState().isLoading).toBe(false)
  })

  it('handles malformed limit details and ordinary failures safely', async () => {
    vi.mocked(recipeApi.recommendRecipe)
      .mockRejectedValueOnce(limited('사용 한도에 도달했습니다.', 'invalid date'))
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 429, data: {} } })
      .mockRejectedValueOnce(new Error('private error details'))
    await useRecipeStore.getState().fetchRecipe([10])
    expect(useRecipeStore.getState().error).toBe('사용 한도에 도달했습니다.')
    await useRecipeStore.getState().fetchRecipe([10])
    expect(useRecipeStore.getState().error).toContain('사용 한도에 도달했습니다.')
    await useRecipeStore.getState().fetchRecipe([10])
    expect(useRecipeStore.getState().error).toBe('메뉴 추천에 실패했습니다.')
    expect(useRecipeStore.getState().isLoading).toBe(false)
  })
})
