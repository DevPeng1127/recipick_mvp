import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MenuSelection from '../components/recipe/MenuSelection'
import { expiryGroup } from '../constants/menu'
import { useRecipeStore } from '../stores/useRecipeStore'
import * as api from '../api/recipes'
import type { MenuIngredient, MenuInventory } from '../types/recipe'
import type { Refrigerator } from '../types/refrigerator'

vi.mock('../api/recipes')
const fridges: Refrigerator[] = [10, 20].map(id => ({id, name: `냉장고 ${id}`, created_at: '', role: 'OWNER', is_favorite: false, top_ingredients: [], total_ingredient_count: 5}))
function ingredient(id: number, name: string, expiry_date: string | null, source: MenuIngredient['expiry_source'] = 'label'): MenuIngredient {
  return { ingredient_id: id, name, quantity: 1, unit: '개', expiry_date, expiry_source: source, refrigerator_id: 10, refrigerator_name: '냉장고 10', storage_box_name: '검증용 칸' }
}
function inventory(): MenuInventory {
  return { as_of: '2026-10-30', ingredients: [ingredient(1, '당근', '2026-10-30', 'estimated'), ingredient(2, '냉동 피자', '2026-11-02'), ingredient(3, '크랜베리 주스', '2026-11-03'), ingredient(4, '지난 두부', '2026-10-29'), ingredient(5, '소금', null, 'untracked')] }
}
beforeEach(() => {
  vi.resetAllMocks()
  useRecipeStore.setState(useRecipeStore.getInitialState(), true)
  vi.mocked(api.getMenuInventory).mockResolvedValue(inventory())
  vi.mocked(api.recommendRecipe).mockResolvedValue({recipe: '피자를 데우고 주스를 따로 곁들입니다.'})
})
afterEach(cleanup)
const submit = () => screen.getByRole('button', { name: /AI 메뉴 추천받기/ })
async function setup() {
  const user = userEvent.setup()
  render(<MenuSelection refrigerators={fridges} busy={false} onRecommend={useRecipeStore.getState().fetchRecipe} />)
  await user.click(screen.getByRole('button', {name: /냉장고 10/}))
  await screen.findByRole('checkbox', {name: /당근/})
  return user
}

it('separates today through day 3, later, unknown and past using the supplied Korean date', () => {
  expect(inventory().ingredients.map(item => expiryGroup(item, '2026-10-30'))).toEqual(['soon', 'soon', 'later', 'past', 'later'])
  expect(expiryGroup(ingredient(1,'당근','2027-01-02'), '2026-12-30')).toBe('soon')
})

it('invites selection without calling AI and passes exact priorities with servings', async () => {
  const user = await setup()
  expect(screen.getByText('추정 사용 권장일 2026-10-30')).toBeVisible()
  expect(screen.getByText('제품 소비기한 2026-11-02')).toBeVisible()
  expect(screen.getByRole('checkbox', {name:/당근/})).not.toBeChecked()
  expect(api.recommendRecipe).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', {name:'임박 재료를 우선 선택 (최대 30개)'}))
  await user.click(screen.getByText('다른 재료에서 선택 · 2개'))
  await user.click(screen.getByRole('checkbox', {name:/크랜베리 주스/}))
  await user.selectOptions(screen.getByLabelText('인분'), '2')
  await user.click(submit())
  expect(api.recommendRecipe).toHaveBeenCalledWith([10], 2, [1,2,3])
  expect(useRecipeStore.getState().recipe).toContain('따로 곁들')
})

it('never offers a past date as a priority and permits whole-fridge recommendation', async () => {
  const user = await setup()
  await user.click(screen.getByText('날짜가 지나 상태 확인이 필요한 재료 · 1개'))
  expect(screen.getByText('지난 두부')).toBeVisible()
  expect(screen.queryByRole('checkbox', {name:/지난 두부/})).not.toBeInTheDocument()
  await user.click(submit())
  expect(api.recommendRecipe).toHaveBeenCalledWith([10], 1, [])
})

it('clears priorities and hides old items immediately when refrigerator scope changes', async () => {
  const user = await setup()
  await user.click(screen.getByRole('checkbox', {name:/당근/}))
  let resolve!: (data: MenuInventory) => void
  vi.mocked(api.getMenuInventory).mockImplementationOnce(() => new Promise(done => {resolve=done}))
  await user.click(screen.getByRole('button', {name:/냉장고 20/}))
  expect(screen.queryByRole('checkbox', {name:/당근/})).not.toBeInTheDocument()
  expect(submit()).toBeDisabled()
  await act(async () => resolve(inventory()))
  expect(await screen.findByRole('checkbox', {name:/당근/})).not.toBeChecked()
  await user.click(submit())
  expect(api.recommendRecipe).toHaveBeenCalledWith([10,20], 1, [])
})

it('ignores an old response after switching scope', async () => {
  let resolve!: (data: MenuInventory) => void
  vi.mocked(api.getMenuInventory).mockImplementationOnce(() => new Promise(done => {resolve=done}))
  const user = userEvent.setup()
  render(<MenuSelection refrigerators={fridges} busy={false} onRecommend={vi.fn()} />)
  await user.click(screen.getByRole('button', {name:/냉장고 10/}))
  await user.click(screen.getByRole('button', {name:/냉장고 10/}))
  await act(async () => resolve(inventory()))
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(submit()).toBeDisabled()
})

it('refresh resets selection; an error hides stale inventory until a successful retry', async () => {
  const user = await setup()
  await user.click(screen.getByRole('checkbox', {name:/당근/}))
  vi.mocked(api.getMenuInventory).mockRejectedValueOnce(new Error('connection'))
  await user.click(screen.getByRole('button', {name:/목록 새로고침/}))
  expect(await screen.findByRole('alert')).toHaveTextContent('재료 목록을 불러오지 못했습니다')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(submit()).toBeDisabled()
  await user.click(screen.getByRole('button', {name:/목록 새로고침/}))
  expect(await screen.findByRole('checkbox', {name:/당근/})).not.toBeChecked()
})

it('limits bulk priority selection to 30 while allowing deselection', async () => {
  vi.mocked(api.getMenuInventory).mockResolvedValue({as_of:'2026-10-30', ingredients:Array.from({length:31},(_,i)=>ingredient(i+1,`재료${i+1}`,'2026-10-31'))})
  const user = userEvent.setup()
  render(<MenuSelection refrigerators={fridges} busy={false} onRecommend={useRecipeStore.getState().fetchRecipe} />)
  await user.click(screen.getByRole('button',{name:/냉장고 10/}))
  await user.click(await screen.findByRole('button',{name:'임박 재료를 우선 선택 (최대 30개)'}))
  expect(screen.getAllByRole('checkbox').filter(box=>(box as HTMLInputElement).checked)).toHaveLength(30)
  const last = screen.getByRole('checkbox',{name:'재료31 · 검증용 칸 · 재고 31'})
  expect(last).toBeDisabled()
  await user.click(screen.getByRole('checkbox',{name:'재료1 · 검증용 칸 · 재고 1'}))
  expect(last).toBeEnabled()
})

it('handles an empty refrigerator without an AI request', async () => {
  vi.mocked(api.getMenuInventory).mockResolvedValue({as_of:'2026-10-30', ingredients:[]})
  render(<MenuSelection refrigerators={fridges} busy={false} onRecommend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button',{name:/냉장고 10/}))
  await screen.findByText('선택한 냉장고에 재료가 없습니다.')
  expect(submit()).toBeDisabled()
  expect(api.recommendRecipe).not.toHaveBeenCalled()
})

it('reports a stale priority without automatically issuing another AI request', async () => {
  const user = await setup()
  await user.click(screen.getByRole('checkbox',{name:/당근/}))
  vi.mocked(api.recommendRecipe).mockRejectedValueOnce({isAxiosError:true,response:{status:409}})
  await user.click(submit())
  await waitFor(()=>expect(useRecipeStore.getState().error).toContain('새로고침'))
  expect(api.recommendRecipe).toHaveBeenCalledTimes(1)
})
