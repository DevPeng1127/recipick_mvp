import type { ExpirySource, ExpiryValue } from '../../types/ingredient'
import { expiryTitle } from '../../constants/expiry'

interface Props {
  value: ExpiryValue
  onChange: (value: ExpiryValue) => void
  suggestion?: ExpiryValue
  onApplySuggestion?: () => void
  suffix?: string
}

export default function ExpiryInput({ value, onChange, suggestion, onApplySuggestion, suffix = '' }: Props) {
  const changeSource = (source: ExpirySource) => onChange({ expiry_source: source,
    expiry_date: source === 'label' ? (value.expiry_source === 'label' ? value.expiry_date : null)
      : source === 'estimated' ? (suggestion?.expiry_date ?? (value.expiry_source === 'estimated' ? value.expiry_date : null)) : null })
  return <div className="space-y-2 text-xs text-gray-600">
    <label className="block">기한 구분
      <select aria-label={`기한 구분${suffix}`} value={value.expiry_source}
        onChange={event => changeSource(event.target.value as ExpirySource)} className="mt-1 w-full min-w-0 rounded border bg-white px-2 py-2 text-sm">
        <option value="unknown">{value.expiry_date && value.expiry_source === 'unknown' ? '기존 입력 기한 (출처 미확인)' : '기한 미입력'}</option>
        <option value="label">제품 소비기한</option>
        <option value="estimated">추정 사용 권장일</option>
        <option value="untracked">기한 관리 안 함</option>
      </select>
    </label>
    {(value.expiry_date || value.expiry_source === 'label' || value.expiry_source === 'estimated') && <label className="block">{expiryTitle(value.expiry_source)}
      <input aria-label={`기한 날짜${suffix}`} type="date" value={value.expiry_date ?? ''}
        onChange={event => onChange({ expiry_date: event.target.value || null,
          expiry_source: event.target.value ? value.expiry_source : 'unknown' })}
        className="mt-1 w-full min-w-0 rounded border px-2 py-2 text-sm text-gray-800" />
    </label>}
    {value.expiry_source === 'estimated' && <p>제품 소비기한이 아닌 추정값입니다. 제품 표시·개봉 및 보관 상태를 우선 확인해 주세요.</p>}
    {suggestion?.expiry_date && onApplySuggestion && value.expiry_source !== 'label' && <button type="button" onClick={onApplySuggestion}
      className="text-purple-700 underline">추천 다시 적용 ({suggestion.expiry_date})</button>}
  </div>
}
