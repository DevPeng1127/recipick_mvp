const KEY = 'recipick_pending_invitation'
const valid = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

export function pendingInvitation(): string | null {
  const token = sessionStorage.getItem(KEY)
  return token && valid(token) ? token : null
}
export function saveInvitation(token: string): boolean {
  sessionStorage.removeItem(KEY)
  if (!valid(token)) return false
  sessionStorage.setItem(KEY, token)
  return true
}
export function clearInvitation() {
  sessionStorage.removeItem(KEY)
}
export function afterLoginPath() {
  return pendingInvitation() ? '/invite' : '/dashboard'
}
