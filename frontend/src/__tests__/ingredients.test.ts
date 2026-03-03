import { describe, it, expect } from 'vitest'
import {
  getExpiryDate,
  SHELF_LIFE_DAYS,
  DEFAULT_SHELF_LIFE_DAYS,
  UNIT_OPTIONS,
} from '../constants/ingredients'

describe('getExpiryDate', () => {
  it('returns default +7 days for unknown ingredient', () => {
    const result = getExpiryDate('알수없는재료')
    const expected = new Date()
    expected.setDate(expected.getDate() + DEFAULT_SHELF_LIFE_DAYS)
    expect(result).toBe(expected.toISOString().split('T')[0])
  })

  it('returns correct expiry for known ingredient (양파 = 30 days)', () => {
    const result = getExpiryDate('양파')
    const expected = new Date()
    expected.setDate(expected.getDate() + 30)
    expect(result).toBe(expected.toISOString().split('T')[0])
  })

  it('returns correct expiry for 닭고기 (3 days)', () => {
    const result = getExpiryDate('닭고기')
    const expected = new Date()
    expected.setDate(expected.getDate() + 3)
    expect(result).toBe(expected.toISOString().split('T')[0])
  })

  it('returns correct expiry for 쌀 (180 days)', () => {
    const result = getExpiryDate('쌀')
    const expected = new Date()
    expected.setDate(expected.getDate() + 180)
    expect(result).toBe(expected.toISOString().split('T')[0])
  })

  it('returns default for empty string', () => {
    const result = getExpiryDate('')
    const expected = new Date()
    expected.setDate(expected.getDate() + DEFAULT_SHELF_LIFE_DAYS)
    expect(result).toBe(expected.toISOString().split('T')[0])
  })
})

describe('SHELF_LIFE_DAYS', () => {
  it('contains expected ingredients', () => {
    expect(SHELF_LIFE_DAYS['양파']).toBe(30)
    expect(SHELF_LIFE_DAYS['계란']).toBe(21)
    expect(SHELF_LIFE_DAYS['참기름']).toBe(365)
  })
})

describe('UNIT_OPTIONS', () => {
  it('contains common unit types', () => {
    expect(UNIT_OPTIONS).toContain('개')
    expect(UNIT_OPTIONS).toContain('g')
    expect(UNIT_OPTIONS).toContain('kg')
    expect(UNIT_OPTIONS).toContain('ml')
    expect(UNIT_OPTIONS).toContain('L')
  })
})
