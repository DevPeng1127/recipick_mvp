import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConsumeDisposeDialog from '../components/ingredient/ConsumeDisposeDialog'
import type { Ingredient } from '../types/ingredient'

const ingredient: Ingredient = {
  id: 20, storage_box_id: 10, name: '우유', quantity: 5, unit: 'L', expiry_date: null,
}
const actions = [
  { actionType: 'consume', label: '소비' },
  { actionType: 'dispose', label: '폐기' },
] as const

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  // Also handle rejection when reproducing the old, unawaited callback.
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

afterEach(cleanup)

describe.each(actions)('$label dialog', ({ actionType, label }) => {
  it('waits for success and blocks duplicate submission, edits and dismissal', async () => {
    const pending = deferred()
    const onConfirm = vi.fn(() => pending.promise)
    const onClose = vi.fn()
    const { container } = render(
      <ConsumeDisposeDialog isOpen ingredient={ingredient} actionType={actionType}
        onConfirm={onConfirm} onClose={onClose} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '수량 지정' }))
    await user.type(screen.getByRole('spinbutton'), '1.5')
    await user.type(screen.getByPlaceholderText('예: 유통기한 지남'), '점심 준비')
    const submit = screen.getByRole('button', { name: `${label}하기` })

    act(() => { fireEvent.click(submit); fireEvent.click(submit) })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 1.5, memo: '점심 준비' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '처리 중...' })).toBeDisabled()
    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(screen.getByPlaceholderText('예: 유통기한 지남')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전부' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '수량 지정' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.click(container.querySelector('.bg-opacity-50')!)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => pending.resolve())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(['all', 'partial'] as const)('keeps %s input after failure and can retry', async (mode) => {
    const pending = deferred()
    const onConfirm = vi.fn<() => Promise<void>>()
      .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<ConsumeDisposeDialog isOpen ingredient={ingredient} actionType={actionType}
      onConfirm={onConfirm} onClose={onClose} />)
    const user = userEvent.setup()
    if (mode === 'partial') {
      await user.click(screen.getByRole('button', { name: '수량 지정' }))
      await user.type(screen.getByRole('spinbutton'), '1.5')
    }
    await user.type(screen.getByPlaceholderText('예: 유통기한 지남'), '보관 메모')
    await user.click(screen.getByRole('button', { name: `${label}하기` }))
    await act(async () => pending.reject(new Error('Request failed')))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(`${label} 처리 중 오류가 발생했습니다`)
    expect(screen.getByPlaceholderText('예: 유통기한 지남')).toHaveValue('보관 메모')
    if (mode === 'partial') expect(screen.getByRole('spinbutton')).toHaveValue(1.5)
    expect(screen.getByRole('button', { name: `${label}하기` })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: `${label}하기` }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenLastCalledWith({
      quantity: mode === 'partial' ? 1.5 : null, memo: '보관 메모',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

it.each(['', '0', '-1', '6'])('does not submit invalid partial quantity %s', async (quantity) => {
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  render(<ConsumeDisposeDialog isOpen ingredient={ingredient} actionType="consume"
    onConfirm={onConfirm} onClose={vi.fn()} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '수량 지정' }))
  if (quantity) await user.type(screen.getByRole('spinbutton'), quantity)
  await user.click(screen.getByRole('button', { name: '소비하기' }))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toBeVisible()
})

it('allows dismissal after failure and clears input when reopened', async () => {
  const onClose = vi.fn()
  const props = {
    ingredient, actionType: 'consume' as const, onClose,
    onConfirm: vi.fn().mockRejectedValue(new Error('Request failed')),
  }
  const { rerender } = render(<ConsumeDisposeDialog {...props} isOpen />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '수량 지정' }))
  await user.type(screen.getByRole('spinbutton'), '1')
  await user.type(screen.getByPlaceholderText('예: 유통기한 지남'), '메모')
  await user.click(screen.getByRole('button', { name: '소비하기' }))
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  rerender(<ConsumeDisposeDialog {...props} isOpen={false} />)
  rerender(<ConsumeDisposeDialog {...props} isOpen />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('예: 유통기한 지남')).toHaveValue('')
})
