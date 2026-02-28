import type { CookingSkill } from '../../api/users'

interface SkillLevelSelectorProps {
  value: CookingSkill | null
  onChange: (value: CookingSkill) => void
}

const skills: { value: CookingSkill; label: string; desc: string }[] = [
  { value: 'LOW', label: '초보', desc: '기본적인 요리만 가능해요' },
  { value: 'MEDIUM', label: '중급', desc: '대부분의 요리를 할 수 있어요' },
  { value: 'HIGH', label: '고급', desc: '복잡한 요리도 자신 있어요' },
]

export default function SkillLevelSelector({ value, onChange }: SkillLevelSelectorProps) {
  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <button
          key={skill.value}
          type="button"
          onClick={() => onChange(skill.value)}
          className={`w-full text-left p-3 rounded-lg border transition ${
            value === skill.value
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-200 hover:border-purple-300'
          }`}
        >
          <div className="font-medium">{skill.label}</div>
          <div className="text-sm text-gray-500">{skill.desc}</div>
        </button>
      ))}
    </div>
  )
}
