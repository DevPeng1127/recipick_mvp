import client from './client'
import type { ActivityDashboard, ActivityFilters } from '../types/activity'

export async function getActivity(filters: ActivityFilters, cursor: string | null, signal: AbortSignal): Promise<ActivityDashboard> {
  const { data } = await client.get<ActivityDashboard>('/activity', {
    signal,
    params: {
      days: filters.days,
      refrigerator_id: filters.refrigeratorId ?? undefined,
      action_type: filters.actionType || undefined,
      cursor: cursor ?? undefined,
    },
  })
  return data
}
