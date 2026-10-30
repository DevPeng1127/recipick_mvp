import type { ActivityDay } from '../../types/activity'

export default function ActivityTrend({ days }: { days: ActivityDay[] }) {
  const max = Math.max(1, ...days.flatMap(day => [day.consumed, day.disposed]))
  const x = (i: number) => 42 + (i / Math.max(1, days.length - 1)) * 640
  const y = (count: number) => 170 - (count / max) * 135
  const points = (key: 'consumed' | 'disposed') => days.map((day, i) => `${x(i).toFixed(1)},${y(day[key]).toFixed(1)}`).join(' ')
  const marks = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]
  return <section className="bg-white rounded-xl border p-4 sm:p-5 min-w-0" aria-labelledby="activity-trend-title">
    <div className="flex flex-wrap gap-3 justify-between items-center">
      <h2 id="activity-trend-title" className="text-lg font-bold">일별 소비·폐기 추이</h2>
      <p className="flex gap-4 text-sm"><span className="text-purple-700">● 소비</span><span className="text-rose-700">┄ 폐기</span></p>
    </div>
    <svg viewBox="0 0 720 210" className="w-full mt-3" role="img" aria-label="한국 시간 기준 일별 소비·폐기 건수 그래프. 아래 일별 수치 보기에서 정확한 값을 확인할 수 있습니다.">
      <line x1="42" y1="35" x2="682" y2="35" stroke="#e5e7eb" />
      <line x1="42" y1="170" x2="682" y2="170" stroke="#d1d5db" />
      <text x="30" y="40" textAnchor="end" fontSize="14" fill="#6b7280">{max}</text>
      <text x="30" y="175" textAnchor="end" fontSize="14" fill="#6b7280">0</text>
      <polyline points={points('consumed')} fill="none" stroke="#7e22ce" strokeWidth="3" />
      <polyline points={points('disposed')} fill="none" stroke="#be123c" strokeWidth="3" strokeDasharray="6 4" />
      {marks.filter(i => i >= 0 && days[i]).map(i => <text key={i} x={x(i)} y="198" textAnchor="middle" fontSize="14" fill="#6b7280">{days[i].date.slice(5).replace('-', '/')}</text>)}
    </svg>
    <details className="text-sm mt-1">
      <summary className="cursor-pointer text-purple-700">일별 수치 보기</summary>
      <div className="max-h-60 overflow-auto mt-3">
        <table className="w-full text-right">
          <caption className="sr-only">일별 처리 건수 (한국 시간)</caption>
          <thead><tr><th className="text-left p-2">날짜</th><th className="p-2">소비</th><th className="p-2">폐기</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date} className="border-t"><th className="text-left font-normal p-2">{day.date}</th><td className="p-2">{day.consumed}건</td><td className="p-2">{day.disposed}건</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>
}
