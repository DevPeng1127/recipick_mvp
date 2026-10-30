import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/ingredients'
import StorageBoxPage from '../pages/StorageBoxPage'
import { useIngredientStore } from '../stores/useIngredientStore'
import type { Ingredient } from '../types/ingredient'

vi.mock('../api/ingredientImport', () => ({ getImportStorageBox: async () => ({ id: 10, type: 'FRIDGE' }) }))
vi.mock('../api/ingredients')

const ingredient: Ingredient = {
  id: 20, storage_box_id: 10, name: '우유', quantity: 2.5, unit: 'L', expiry_date: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  useIngredientStore.setState(useIngredientStore.getInitialState(), true)
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue([ingredient])
})
afterEach(cleanup)

describe.each([
  { label: '소비', request: api.consumeIngredient },
  { label: '폐기', request: api.disposeIngredient },
])('$label through page and store', ({ label, request }) => {
  it('preserves stock on failure, then applies partial and full success', async () => {
    vi.mocked(request)
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce({ ...ingredient, quantity: 2 })
      .mockResolvedValueOnce(null)
    render(<MemoryRouter initialEntries={['/storage-boxes/10']}>
      <Routes><Route path="/storage-boxes/:id" element={<StorageBoxPage />} /></Routes>
    </MemoryRouter>)
    const user = userEvent.setup()
    await screen.findByText('우유')
    await user.click(screen.getByRole('button', { name: '' }))
    await user.click(screen.getByRole('button', { name: label }))
    await user.click(screen.getByRole('button', { name: '수량 지정' }))
    await user.type(screen.getByPlaceholderText('0'), '0.5')
    await user.type(screen.getByPlaceholderText('예: 유통기한 지남'), '기록')
    await user.click(screen.getByRole('button', { name: `${label}하기` }))

    await screen.findByRole('alert')
    expect(useIngredientStore.getState().ingredients).toEqual([ingredient])
    expect(screen.getByRole('heading', { name: `식재료 ${label}` })).toBeVisible()
    await user.click(screen.getByRole('button', { name: `${label}하기` }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: `식재료 ${label}` })).toBeNull())
    expect(screen.getByText('2L')).toBeVisible()
    expect(request).toHaveBeenNthCalledWith(2, 10, 20, { quantity: 0.5, memo: '기록' })

    await user.click(screen.getByRole('button', { name: '' }))
    await user.click(screen.getByRole('button', { name: label }))
    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('예: 유통기한 지남')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: `${label}하기` }))
    await waitFor(() => expect(screen.queryByText('우유')).not.toBeInTheDocument())
    expect(useIngredientStore.getState().ingredients).toEqual([])
    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenLastCalledWith(10, 20, { quantity: null, memo: null })
  })
})
