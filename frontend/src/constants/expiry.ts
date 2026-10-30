import type { ExpirySource, ExpiryValue } from '../types/ingredient'
import type { StorageType } from '../types/storage'

// Sources, matching rules and conditions: docs/expiry-guidance.md.
// Use the lower end of published ranges; months are conservatively 28 days.
const DAYS: Record<string, Partial<Record<StorageType, number>>> = {
  '브로콜리': { FRIDGE: 3 }, '양배추': { FRIDGE: 7 }, '당근': { FRIDGE: 14 },
  '콜리플라워': { FRIDGE: 3 }, '셀러리': { FRIDGE: 7 }, '옥수수': { FRIDGE: 1 },
  '오이': { FRIDGE: 4 }, '가지': { FRIDGE: 4 }, '버섯': { FRIDGE: 3 },
  '양파': { ROOM: 28, FRIDGE: 56 }, '대파': { FRIDGE: 7 }, '고추': { ROOM: 4, FRIDGE: 4 },
  '파프리카': { ROOM: 4, FRIDGE: 4 }, '감자': { ROOM: 28, FRIDGE: 7 },
  '고구마': { ROOM: 14 }, '시금치': { FRIDGE: 3 }, '상추': { FRIDGE: 3 },
  '닭고기': { FRIDGE: 1, FREEZER: 252 }, '소고기': { FRIDGE: 3, FREEZER: 112 },
  '돼지고기': { FRIDGE: 3, FREEZER: 112 }, '다진고기': { FRIDGE: 1, FREEZER: 84 },
  '연어': { FRIDGE: 1, FREEZER: 56 }, '고등어': { FRIDGE: 1, FREEZER: 56 },
  '계란': { FRIDGE: 21 }, '개봉한우유': { FRIDGE: 3 }, '개봉한요거트': { FRIDGE: 3 },
}
const ALIASES: Record<string, string> = {
  '달걀': '계란', '생닭': '닭고기', '생닭가슴살': '닭고기',
  '쇠고기': '소고기', '다진소고기': '다진고기', '다진돼지고기': '다진고기',
  '생양송이버섯': '버섯', '양송이버섯': '버섯', '적양파': '양파',
}

export function todayKst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function recommendExpiry(name: string, storageType?: StorageType, baseDate = todayKst()): ExpiryValue {
  // Do not guess from substrings: 닭고기카레 / 딸기우유 / 양파소스 are different products.
  const key = name.normalize('NFKC').replace(/\s+/g, '').replace(/\(?\d+(?:\.\d+)?(?:kg|g|ml|L|l|개|팩|봉지)\)?$/i, '')
  const days = storageType ? DAYS[ALIASES[key] ?? key]?.[storageType] : undefined
  if (days === undefined) return { expiry_date: null, expiry_source: 'unknown' }
  const date = new Date(`${baseDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return { expiry_date: date.toISOString().slice(0, 10), expiry_source: 'estimated' }
}

export function expiryTitle(source?: ExpirySource): string {
  return source === 'estimated' ? '추정 사용 권장일' : source === 'label' ? '제품 소비기한' : '입력한 기한'
}

export function expiryText(date: string | null, source?: ExpirySource): string {
  return date ? `${expiryTitle(source)} ${date}` : source === 'untracked' ? '기한 관리 안 함' : '기한 미입력'
}
