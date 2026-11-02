import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import HelpDisclosure from '../components/common/HelpDisclosure'

afterEach(cleanup)

it('opens and closes with the keyboard without submitting its containing form', async () => {
  const user = userEvent.setup()
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
  render(<form onSubmit={submit}>
    <HelpDisclosure label="등록" title={<h2>등록</h2>}><p>등록 방법 안내</p></HelpDisclosure>
  </form>)
  const button = screen.getByRole('button', { name: '등록 도움말' })
  const description = screen.getByText('등록 방법 안내')
  expect(description).not.toBeVisible()
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(document.getElementById(button.getAttribute('aria-controls')!)).toContainElement(description)
  await user.tab()
  expect(button).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(description).toBeVisible()
  expect(button).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard(' ')
  expect(description).not.toBeVisible()
  expect(button).toHaveFocus()
  expect(submit).not.toHaveBeenCalled()
})

it('keeps multiple help panels independent and preserves the surrounding input', async () => {
  const user = userEvent.setup()
  render(<>
    <label>수량<input defaultValue="1" /></label>
    <HelpDisclosure label="수량" title="수량"><p>수량 안내</p></HelpDisclosure>
    <HelpDisclosure label="기한" title="기한"><p>기한 안내</p></HelpDisclosure>
  </>)
  const quantity = screen.getByRole('button', { name: '수량 도움말' })
  const expiry = screen.getByRole('button', { name: '기한 도움말' })
  expect(quantity.getAttribute('aria-controls')).not.toBe(expiry.getAttribute('aria-controls'))
  await user.clear(screen.getByLabelText('수량'))
  await user.type(screen.getByLabelText('수량'), '0.25')
  await user.click(quantity)
  expect(screen.getByText('수량 안내')).toBeVisible()
  expect(screen.getByText('기한 안내')).not.toBeVisible()
  await user.click(expiry)
  await user.click(quantity)
  expect(screen.getByText('수량 안내')).not.toBeVisible()
  expect(screen.getByText('기한 안내')).toBeVisible()
  expect(screen.getByLabelText('수량')).toHaveValue('0.25')
})
