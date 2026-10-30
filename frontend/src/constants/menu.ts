import type { MenuIngredient } from '../types/recipe'

export function expiryGroup(item: MenuIngredient, today: string): 'soon' | 'later' | 'past' {
  if (!item.expiry_date) return 'later'
  const days = (Date.parse(`${item.expiry_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  return days < 0 ? 'past' : days <= 3 ? 'soon' : 'later'
}
