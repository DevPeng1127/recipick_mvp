import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import IngredientForm from '../components/ingredient/IngredientForm'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import ExpiryBadge from '../components/ingredient/ExpiryBadge'

afterEach(cleanup)

it('fills a known fresh food then preserves a manually entered product date across name changes', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<IngredientForm storageType="FRIDGE" onSubmit={onSubmit} />)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('식재료 이름'), '당근')
  expect(screen.getByLabelText('기한 구분')).toHaveValue('estimated')
  expect(screen.getByLabelText('기한 날짜')).not.toHaveValue('')
  await user.selectOptions(screen.getByLabelText('기한 구분'), 'label')
  // A recommendation must not silently turn into a manufacturer date.
  expect(screen.getByLabelText('기한 날짜')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('기한 날짜'), { target: { value: '2026-12-15' } })
  await user.clear(screen.getByPlaceholderText('식재료 이름'))
  await user.type(screen.getByPlaceholderText('식재료 이름'), '오이')
  expect(screen.getByLabelText('기한 날짜')).toHaveValue('2026-12-15')
  await user.click(screen.getByRole('button', { name: '추가' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: '오이', expiry_date: '2026-12-15', expiry_source: 'label' }))
  expect(screen.getByLabelText('기한 구분')).toHaveValue('unknown')
})

it('can opt out of date tracking and never gives unknown food an arbitrary date', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<IngredientForm storageType="ROOM" onSubmit={onSubmit} />)
  await userEvent.type(screen.getByPlaceholderText('식재료 이름'), '소금')
  expect(screen.getByLabelText('기한 구분')).toHaveValue('unknown')
  await userEvent.selectOptions(screen.getByLabelText('기한 구분'), 'untracked')
  await userEvent.click(screen.getByRole('button', { name: '추가' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expiry_date: null, expiry_source: 'untracked' }))
})

it('does not override a deliberately cleared date on another name edit', async () => {
  render(<IngredientForm storageType="FRIDGE" onSubmit={vi.fn()} />)
  await userEvent.type(screen.getByPlaceholderText('식재료 이름'), '당근')
  fireEvent.change(screen.getByLabelText('기한 날짜'), { target: { value: '' } })
  await userEvent.clear(screen.getByPlaceholderText('식재료 이름'))
  await userEvent.type(screen.getByPlaceholderText('식재료 이름'), '양배추')
  expect(screen.getByLabelText('기한 구분')).toHaveValue('unknown')
  await userEvent.click(screen.getByRole('button', { name: /추천 다시 적용/ }))
  expect(screen.getByLabelText('기한 구분')).toHaveValue('estimated')
})

it('editing existing stock preserves the old recommendation instead of extending its date', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<EditIngredientModal isOpen onClose={vi.fn()} onDelete={vi.fn()} onSave={onSave}
    ingredient={{ id: 1, storage_box_id: 1, name: '당근', quantity: 2, unit: '개', expiry_date: '2025-01-01', expiry_source: 'estimated' }} />)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expiry_date: '2025-01-01', expiry_source: 'estimated' }))
})

it('shows an estimated date as a recommendation, not an expiration', () => {
  render(<ExpiryBadge expiryDate="2020-01-01" expirySource="estimated" />)
  expect(screen.getByText(/권장 D\+/)).toBeVisible()
  expect(screen.queryByText(/만료|소비기한/)).not.toBeInTheDocument()
})
