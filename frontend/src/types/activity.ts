import type { ExpirySource } from './ingredient'
export type ActivityAction = 'CONSUMED' | 'DISPOSED'
export interface ActivityFilters {
  days: 7 | 30 | 90
  refrigeratorId: number | null
  actionType: ActivityAction | ''
}
export interface ActivityDay { date: string; consumed: number; disposed: number }
export interface ActivityItem {
  id: number
  action_type: ActivityAction
  ingredient_name: string
  quantity: number
  unit: string
  refrigerator_id: number | null
  refrigerator_name: string
  actor_name: string
  is_mine: boolean
  expiry_date: string | null
  expiry_source?: ExpirySource
  memo: string | null
  created_at: string
}
export interface ActivityDashboard {
  scope: 'mine' | 'refrigerator'
  refrigerator_name: string | null
  refrigerators: { id: number; name: string }[]
  start_date: string
  end_date: string
  as_of: string
  counts: { consumed: number; disposed: number; total: number }
  daily: ActivityDay[]
  frequent_disposals: { name: string; count: number }[]
  items: ActivityItem[]
  next_cursor: string | null
}
