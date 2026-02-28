import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CookingSkill, UserPreferenceUpdate } from '../api/users'
import SkillLevelSelector from '../components/preference/SkillLevelSelector'
import AllergyTagInput from '../components/preference/AllergyTagInput'
import CookingToolSelector from '../components/preference/CookingToolSelector'
import { usePreferenceStore } from '../stores/usePreferenceStore'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { savePreference } = usePreferenceStore()
  const { addRefrigerator } = useRefrigeratorStore()

  const [step, setStep] = useState(0)
  const [pref, setPref] = useState<UserPreferenceUpdate>({
    cooking_skill: null,
    max_time: 30,
    allergies: [],
    cooking_tools: [],
    dietary_habits: '',
  })

  const handleFinish = async () => {
    await savePreference(pref)
    await addRefrigerator('우리집 냉장고')
    navigate('/dashboard', { replace: true })
  }

  const steps = [
    {
      title: '요리 실력을 알려주세요',
      content: (
        <SkillLevelSelector
          value={pref.cooking_skill ?? null}
          onChange={(v: CookingSkill) => setPref({ ...pref, cooking_skill: v })}
        />
      ),
    },
    {
      title: '알레르기가 있나요?',
      content: (
        <AllergyTagInput
          value={pref.allergies || []}
          onChange={(v) => setPref({ ...pref, allergies: v })}
        />
      ),
    },
    {
      title: '어떤 조리도구가 있나요?',
      content: (
        <CookingToolSelector
          value={pref.cooking_tools || []}
          onChange={(v) => setPref({ ...pref, cooking_tools: v })}
        />
      ),
    },
    {
      title: '최대 조리 시간은?',
      content: (
        <div>
          <input
            type="range"
            min={10}
            max={120}
            step={10}
            value={pref.max_time || 30}
            onChange={(e) => setPref({ ...pref, max_time: parseInt(e.target.value) })}
            className="w-full"
          />
          <p className="text-center text-lg font-medium mt-2">
            {pref.max_time || 30}분
          </p>
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-6">
        <div className="mb-6">
          <div className="flex gap-1 mb-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${
                  i <= step ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <h2 className="text-xl font-bold text-gray-800">{steps[step].title}</h2>
        </div>

        <div className="mb-8">{steps[step].content}</div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50"
            >
              이전
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700"
            >
              다음
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700"
            >
              시작하기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
