import HelpDisclosure from '../components/common/HelpDisclosure'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { getRefrigerator } from '../api/refrigerators'
import { createInvitation, listInvitations, listMembers, removeMember, revokeInvitation, type Invitation } from '../api/sharing'
import type { RefrigeratorDetail, RefrigeratorMember } from '../types/refrigerator'
import { useAuthStore } from '../stores/useAuthStore'

const statuses = { active: '사용 가능', used: '수락 완료', expired: '만료', revoked: '취소됨' }

export default function SharingPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [fridge, setFridge] = useState<RefrigeratorDetail | null>(null)
  const [members, setMembers] = useState<RefrigeratorMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [link, setLink] = useState<{ id: number; url: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<RefrigeratorMember | null>(null)
  const inFlight = useRef(false)
  const owner = fridge?.role === 'OWNER'

  useEffect(() => {
    let active = true
    setFridge(null)
    setLink(null)
    setError('')
    setConfirmation(null)
    const load = async () => {
      const [detail, people] = await Promise.all([getRefrigerator(id), listMembers(id)])
      const invites = detail.role === 'OWNER' ? await listInvitations(id) : []
      if (active) { setFridge(detail); setMembers(people); setInvitations(invites) }
    }
    load().catch(() => { if (active) setError('공유 정보를 불러올 수 없습니다. 냉장고 접근 권한을 확인해 주세요.') })
    return () => { active = false }
  }, [id])

  const run = async (operation: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try { await operation() } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setFridge(null)
        setLink(null)
        setError('이 작업을 할 권한이 없습니다. 냉장고 목록을 확인해 주세요.')
      } else {
        setError('작업 결과를 확인하지 못했습니다. 새로고침하여 상태를 확인해 주세요.')
      }
    } finally { inFlight.current = false; setBusy(false) }
  }

  return <div className="max-w-2xl mx-auto space-y-6">
    <Link to={`/refrigerators/${id}`} className="text-purple-600">← 냉장고로</Link>
    <h1 className="text-2xl font-bold">가족 공유</h1>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {notice && <p role="status" className="text-purple-700">{notice}</p>}
    {!fridge ? !error && <p>공유 정보를 불러오고 있습니다…</p> : <>
      <p className="font-semibold text-lg break-words">{fridge.name}</p>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <HelpDisclosure label="가족 권한" title={<h2 className="font-bold text-lg">함께 사용하는 회원 ({members.length}명)</h2>}>
          <p>모든 회원이 식재료를 등록·수정·소비·폐기할 수 있습니다. 초대와 회원 관리, 냉장고·보관함 관리는 소유자만 가능합니다.</p>
          {owner && <p>소유자는 탈퇴할 수 없습니다. 소유권 이전은 아직 지원하지 않습니다.</p>}
        </HelpDisclosure>
        <ul className="space-y-3">{members.map((member) => <li key={member.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 break-words">{member.nickname || '이름 없는 회원'} {member.user_id === user?.id && '(나)'}
            <span className="ml-2 text-sm text-gray-500">{member.role === 'OWNER' ? '소유자' : '가족'}</span>
          </span>
          {owner && member.role === 'GUEST' && <button disabled={busy} className="text-red-600 shrink-0" onClick={() => setConfirmation(member)}>내보내기</button>}
        </li>)}</ul>
        {!owner && <button disabled={busy} className="text-red-600" onClick={() => setConfirmation(members.find(m => m.user_id === user?.id) ?? null)}>이 냉장고에서 탈퇴</button>}
        {confirmation && <div role="alert" className="border border-red-200 rounded-lg p-4 space-y-3">
          <p>{confirmation.user_id === user?.id ? '이 냉장고에서 탈퇴할까요?' : `${confirmation.nickname || '이 회원'}님을 내보낼까요?`} 공동 재고와 소비·폐기 이력은 유지되며, 다시 참여하려면 새 초대가 필요합니다.</p>
          <div className="flex gap-4">
            <button disabled={busy} className="text-red-600" onClick={() => run(async () => {
              const leaving = confirmation.user_id === user?.id
              await removeMember(id, leaving ? 'me' : confirmation.user_id)
              setConfirmation(null)
              if (leaving) navigate('/dashboard', { replace: true })
              else { setMembers(await listMembers(id)); setNotice('회원을 내보냈습니다.') }
            })}>{busy ? '처리 중…' : '확인'}</button>
            <button disabled={busy} onClick={() => setConfirmation(null)}>취소</button>
          </div>
        </div>}
      </section>
      {owner && <section className="bg-white border rounded-xl p-5 space-y-4">
        <HelpDisclosure label="가족 초대" title={<h2 className="font-bold text-lg">가족 초대</h2>}>
          <p>링크를 받은 사람은 로그인 후 수락하면 참여합니다.</p>
          <p>링크 원문은 만든 직후에만 표시됩니다. 잃어버렸다면 기존 초대를 취소하고 새 링크를 만드세요.</p>
        </HelpDisclosure>
        <p className="text-sm text-gray-600">24시간 유효 · 1명용 링크입니다. 초대할 가족에게만 전달하세요.</p>
        <button disabled={busy} className="bg-purple-600 text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={() => run(async () => {
          const result = await createInvitation(id)
          setLink({ id: result.id, url: result.url })
          setInvitations(previous => [result, ...previous])
          setNotice('초대 링크를 만들었습니다. 복사하여 가족에게 전달해 주세요.')
        })}>초대 링크 만들기</button>
        {link && <div className="space-y-2">
          <label className="block text-sm" htmlFor="invitation-link">새 초대 링크</label>
          <input id="invitation-link" className="w-full min-w-0 border rounded p-2 text-sm" readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} />
          <button className="text-purple-600" onClick={async () => {
            try { await navigator.clipboard.writeText(link.url); setNotice('링크를 복사했습니다.') }
            catch { setNotice('자동 복사가 되지 않습니다. 위 링크를 선택해 직접 복사해 주세요.') }
          }}>링크 복사</button>
        </div>}
        {invitations.length > 0 && <ul className="divide-y">{invitations.map(invite => {
          const state = invite.status === 'active' && new Date(invite.expires_at).getTime() <= Date.now() ? 'expired' : invite.status
          return <li key={invite.id} className="py-3 flex justify-between gap-3 items-center">
            <div><p>초대 #{invite.id} · {statuses[state]}</p><p className="text-xs text-gray-500">기한: {new Date(invite.expires_at).toLocaleString('ko-KR')}</p></div>
            {state === 'active' && <button disabled={busy} className="text-red-600 shrink-0" onClick={() => run(async () => {
              await revokeInvitation(id, invite.id)
              if (link?.id === invite.id) setLink(null)
              setInvitations(await listInvitations(id))
              setNotice('초대를 취소했습니다.')
            })}>초대 취소</button>}
          </li>
        })}</ul>}
      </section>}
    </>}
    <Link to="/dashboard" className="block text-sm text-gray-500 underline">내 냉장고 목록</Link>
  </div>
}
