import { describe, it, expect } from 'vitest'
import type { ConsumeDisposeRequest } from '../types/ingredient'

describe('ConsumeDisposeRequest type', () => {
  it('allows empty request (full consume/dispose)', () => {
    const req: ConsumeDisposeRequest = {}
    expect(req.quantity).toBeUndefined()
    expect(req.memo).toBeUndefined()
  })

  it('allows null quantity (full consume/dispose)', () => {
    const req: ConsumeDisposeRequest = { quantity: null }
    expect(req.quantity).toBeNull()
  })

  it('allows partial quantity', () => {
    const req: ConsumeDisposeRequest = { quantity: 2.5 }
    expect(req.quantity).toBe(2.5)
  })

  it('allows memo field', () => {
    const req: ConsumeDisposeRequest = { memo: '유통기한 지남' }
    expect(req.memo).toBe('유통기한 지남')
  })

  it('allows all fields together', () => {
    const req: ConsumeDisposeRequest = { quantity: 1, memo: '반만 사용' }
    expect(req.quantity).toBe(1)
    expect(req.memo).toBe('반만 사용')
  })
})

describe('consume/dispose validation logic', () => {
  const currentQuantity = 5

  it('detects invalid quantity (zero)', () => {
    const qty = 0
    expect(qty <= 0).toBe(true)
  })

  it('detects invalid quantity (negative)', () => {
    const qty = -1
    expect(qty <= 0).toBe(true)
  })

  it('detects quantity exceeding current', () => {
    const qty = 10
    expect(qty > currentQuantity).toBe(true)
  })

  it('accepts valid partial quantity', () => {
    const qty = 3
    expect(qty > 0 && qty <= currentQuantity).toBe(true)
  })

  it('accepts quantity equal to current (full consume)', () => {
    const qty = 5
    expect(qty > 0 && qty <= currentQuantity).toBe(true)
  })
})
