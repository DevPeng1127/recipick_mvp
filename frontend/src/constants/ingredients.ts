export const UNIT_OPTIONS = ['개', 'g', 'kg', 'ml', 'L', '봉지', '팩', '캔', '병', '묶음'] as const
export const CUSTOM_UNIT_OPTION = '직접 입력'

export const SHELF_LIFE_DAYS: Record<string, number> = {
  '양파': 30, '감자': 30, '마늘': 60, '당근': 21, '대파': 14,
  '양배추': 14, '브로콜리': 7, '시금치': 5, '상추': 5, '토마토': 7,
  '오이': 7, '고추': 10, '파프리카': 10, '버섯': 5,
  '닭고기': 3, '소고기': 3, '돼지고기': 3, '두부': 7, '계란': 21,
  '생선': 2, '새우': 3,
  '우유': 10, '치즈': 14, '버터': 30, '요거트': 14,
  '쌀': 180, '라면': 180, '김': 90, '참기름': 365,
}
export const DEFAULT_SHELF_LIFE_DAYS = 7

export function getExpiryDate(name: string): string {
  const days = SHELF_LIFE_DAYS[name] ?? DEFAULT_SHELF_LIFE_DAYS
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
