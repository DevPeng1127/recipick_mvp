import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CookingPanel from '../components/recipe/CookingPanel'
import * as api from '../api/recipes'
import type { CookingPreview, CookingResult } from '../types/recipe'

vi.mock('../api/recipes')

const result: CookingResult = { plan_id: 'plan-1', title: '당근 볶음', items: [
  { ingredient_id: 10, name: '당근', quantity: .25, unit: 'kg', remaining_quantity: .75 },
] }
function preview(): CookingPreview {
  return { plan_id: 'plan-1', title: '당근 볶음', recipe: '요리 내용', servings: 1,
    requirements: [{ ingredient_name: '당근', quantity: 250, unit: 'g' }],
    stock: [{ ingredient_id: 10, name: '당근', quantity: 1, unit: 'kg', expiry_date: null,
      refrigerator_id: 1, refrigerator_name: '가족 냉장고', storage_box_name: '채소칸', token: 'a'.repeat(64) }],
    suggestions: [{ requirement_index: 0, ingredient_id: 10, quantity: .25, message: null }],
    applied_at: null, result: null }
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.getCookingPreview).mockResolvedValue(preview()) })
afterEach(cleanup)
const failure = (status: number, code = 'inventory_changed') => ({ isAxiosError: true, response: { status, data: { detail: { code } } } })
const confirm = () => screen.getByRole('button', { name: '확인한 재료 일괄 차감' })
async function open(data = preview()) {
  vi.mocked(api.getCookingPreview).mockResolvedValue(data)
  const user = userEvent.setup()
  render(<CookingPanel initial={data} onRepeat={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '먹은 항목 확인 · 스마트 차감' }))
  await screen.findByRole('button', { name: '확인한 재료 일괄 차감' })
  return user
}

describe('cooking confirmation', () => {
  it('loads current stock, allows edits, and only consumes on explicit confirmation', async () => {
    const user = await open()
    expect(api.consumeRecipe).not.toHaveBeenCalled()
    expect(screen.getByLabelText('사용량 1')).toHaveValue(.25)
    await user.clear(screen.getByLabelText('사용량 1'))
    await user.type(screen.getByLabelText('사용량 1'), '0.3')
    vi.mocked(api.consumeRecipe).mockResolvedValue(result)
    await user.click(confirm())
    expect(api.consumeRecipe).toHaveBeenCalledWith('plan-1', { items: [{ ingredient_id: 10, quantity: .3, expected_token: 'a'.repeat(64) }] })
    expect(await screen.findByText('차감 완료')).toBeVisible()
  })

  it('requires unknown quantities to be entered or explicitly excluded', async () => {
    const data = preview()
    data.requirements.push({ ingredient_name: '소금', quantity: null, unit: null })
    data.suggestions.push({ requirement_index: 1, ingredient_id: null, quantity: null, message: '직접 확인' })
    const user = await open(data)
    expect(confirm()).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /소금/ }))
    expect(confirm()).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /당근/ }))
    expect(confirm()).toBeDisabled()
  })

  it('aggregates two rows for one stock without exceeding its quantity', async () => {
    const data = preview()
    data.requirements.push({ ingredient_name: '당근', quantity: 500, unit: 'g' })
    data.suggestions.push({ requirement_index: 1, ingredient_id: 10, quantity: .5, message: null })
    const user = await open(data)
    await user.clear(screen.getByLabelText('사용량 2'))
    await user.type(screen.getByLabelText('사용량 2'), '0.9')
    expect(confirm()).toBeDisabled()
    await user.clear(screen.getByLabelText('사용량 2'))
    await user.type(screen.getByLabelText('사용량 2'), '0.5')
    vi.mocked(api.consumeRecipe).mockResolvedValue(result)
    await user.click(confirm())
    expect(api.consumeRecipe).toHaveBeenCalledWith('plan-1', { items: [{ ingredient_id: 10, quantity: .75, expected_token: 'a'.repeat(64) }] })
  })

  it('clears the amount when selecting stock with another unit', async () => {
    const data = preview()
    data.stock.push({ ...data.stock[0], ingredient_id: 11, unit: '개', quantity: 3 })
    const user = await open(data)
    await user.selectOptions(screen.getByLabelText('재고 1'), '11')
    expect(screen.getByLabelText('사용량 1')).toHaveValue(null)
    expect(confirm()).toBeDisabled()
    expect(screen.getByText('실제 사용량 (개)')).toBeVisible()
  })

  it('requires a fresh preview and explicit reconfirmation after a stock conflict', async () => {
    vi.mocked(api.consumeRecipe).mockRejectedValueOnce(failure(409)).mockResolvedValue(result)
    const user = await open()
    await user.click(confirm())
    expect(await screen.findByRole('alert')).toHaveTextContent('차감하지 않았습니다')
    expect(screen.getByLabelText('사용량 1')).toBeDisabled()
    const fresh = preview(); fresh.stock[0].token = 'b'.repeat(64)
    vi.mocked(api.getCookingPreview).mockResolvedValue(fresh)
    await user.click(screen.getByRole('button', { name: /최신 재고 다시/ }))
    expect(api.consumeRecipe).toHaveBeenCalledTimes(1)
    await user.click(confirm())
    expect(api.consumeRecipe).toHaveBeenLastCalledWith('plan-1', { items: [{ ingredient_id: 10, quantity: .25, expected_token: 'b'.repeat(64) }] })
  })

  it('retries the exact request after losing the response and prevents changes meanwhile', async () => {
    vi.mocked(api.consumeRecipe).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(result)
    const user = await open()
    await user.click(confirm())
    expect(await screen.findByRole('alert')).toHaveTextContent('중복 차감하지 않습니다')
    expect(screen.getByLabelText('사용량 1')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /같은 요청 재시도/ }))
    expect(api.consumeRecipe).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.consumeRecipe).mock.calls[1]).toEqual(vi.mocked(api.consumeRecipe).mock.calls[0])
    expect(await screen.findByText('차감 완료')).toBeVisible()
  })

  it('blocks duplicate submissions while pending', async () => {
    let resolve!: (value: CookingResult) => void
    vi.mocked(api.consumeRecipe).mockReturnValue(new Promise(r => { resolve = r }))
    const user = await open()
    await user.dblClick(confirm())
    expect(api.consumeRecipe).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('사용량 1')).toBeDisabled()
    await act(async () => resolve(result))
    expect(await screen.findByText('차감 완료')).toBeVisible()
  })

  it.each([403, 404])('disables further edits after access is denied (%s)', async status => {
    vi.mocked(api.consumeRecipe).mockRejectedValue(failure(status))
    const user = await open()
    await user.click(confirm())
    expect(await screen.findByRole('alert')).toHaveTextContent('접근할 수 없습니다')
    expect(screen.getByLabelText('사용량 1')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /일괄 차감/ })).toBeNull()
  })

  it('retains inputs after a validation rejection', async () => {
    vi.mocked(api.consumeRecipe).mockRejectedValue(failure(422))
    const user = await open()
    await user.click(confirm())
    expect(await screen.findByRole('alert')).toHaveTextContent('입력값을 확인')
    expect(screen.getByLabelText('사용량 1')).toHaveValue(.25)
    expect(confirm()).toBeEnabled()
  })

  it('shows a saved receipt on reload and creates another occasion only by explicit action', async () => {
    const data = preview(); data.result = result; data.applied_at = '2026-10-28T00:00:00Z'
    const onRepeat = vi.fn()
    vi.mocked(api.repeatRecipe).mockResolvedValue({ recipe: data.recipe, plan_id: 'plan-2' })
    render(<CookingPanel initial={data} onRepeat={onRepeat} />)
    expect(screen.getByText('차감 완료')).toBeVisible()
    expect(api.consumeRecipe).not.toHaveBeenCalled()
    expect(api.repeatRecipe).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '이 메뉴로 다시 먹기' }))
    await waitFor(() => expect(onRepeat).toHaveBeenCalledWith('plan-2'))
    expect(api.consumeRecipe).not.toHaveBeenCalled()
  })
})
