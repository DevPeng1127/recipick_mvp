import { expect, it } from 'vitest'
import { UNIT_OPTIONS } from '../constants/ingredients'
import { recommendExpiry, todayKst, expiryText } from '../constants/expiry'

it('keeps common units available', () => {
  expect(UNIT_OPTIONS).toEqual(expect.arrayContaining(['개', 'g', 'kg', 'ml', 'L']))
})
it('uses Korean calendar dates at the UTC boundary', () => {
  expect(todayKst(new Date('2026-10-30T14:59:59Z'))).toBe('2026-10-30')
  expect(todayKst(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31')
  expect(recommendExpiry('닭고기', 'FRIDGE', '2028-02-28').expiry_date).toBe('2028-02-29')
})
it('uses food and storage-specific rules and handles year boundaries', () => {
  expect(recommendExpiry('당근', 'FRIDGE', '2026-12-25')).toEqual({ expiry_date: '2027-01-08', expiry_source: 'estimated' })
  expect(recommendExpiry('양파', 'ROOM', '2026-10-01').expiry_date).toBe('2026-10-29')
  expect(recommendExpiry('양파', 'FRIDGE', '2026-10-01').expiry_date).toBe('2026-11-26')
  expect(recommendExpiry('닭고기', 'FREEZER', '2026-01-01').expiry_date).toBe('2026-09-10')
})
it.each(['당근 500g', '당근(500g)', '당근 ５００ｇ'])('recognizes explicit packaging weight: %s', name => {
  expect(recommendExpiry(name, 'FRIDGE', '2026-10-01').expiry_date).toBe('2026-10-15')
})
it.each(['', '알수없는재료', '닭고기카레', '당근주스', '양파소스', '딸기우유', '우유', '소금', '해동한 닭고기'])('leaves ambiguous or unlisted names unset: %s', name => {
  expect(recommendExpiry(name, 'FRIDGE')).toEqual({ expiry_date: null, expiry_source: 'unknown' })
})
it('does not recommend without a compatible storage type', () => {
  expect(recommendExpiry('닭고기', 'ROOM').expiry_date).toBeNull()
  expect(recommendExpiry('계란', 'FREEZER').expiry_date).toBeNull()
  expect(recommendExpiry('당근').expiry_date).toBeNull()
})
it('distinguishes unknown, untracked, estimated and label dates', () => {
  expect(expiryText(null)).toBe('기한 미입력')
  expect(expiryText(null, 'untracked')).toBe('기한 관리 안 함')
  expect(expiryText('2026-10-31', 'estimated')).toBe('추정 사용 권장일 2026-10-31')
  expect(expiryText('2026-10-31', 'label')).toBe('제품 소비기한 2026-10-31')
})
