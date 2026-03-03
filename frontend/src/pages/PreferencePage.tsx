import { useEffect, useState } from 'react'
import type { CookingSkill, UserPreferenceUpdate } from '../api/users'
import { useAuthStore } from '../stores/useAuthStore'
import { usePreferenceStore } from '../stores/usePreferenceStore'
import SkillLevelSelector from '../components/preference/SkillLevelSelector'
import AllergyTagInput from '../components/preference/AllergyTagInput'
import CookingToolSelector from '../components/preference/CookingToolSelector'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9\-_()]+$/

export default function PreferencePage() {
  const { user, updateNickname } = useAuthStore()
  const { preference, isLoading, error, fetchPreference, savePreference } =
    usePreferenceStore()

  const [form, setForm] = useState<UserPreferenceUpdate>({
    cooking_skill: null,
    max_time: 30,
    allergies: [],
    cooking_tools: [],
    dietary_habits: '',
  })

  // Nickname editing state
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameError, setNicknameError] = useState('')

  useEffect(() => {
    fetchPreference()
  }, [fetchPreference])

  useEffect(() => {
    if (preference) {
      setForm({
        cooking_skill: preference.cooking_skill,
        max_time: preference.max_time ?? 30,
        allergies: preference.allergies ?? [],
        cooking_tools: preference.cooking_tools ?? [],
        dietary_habits: preference.dietary_habits ?? '',
      })
    }
  }, [preference])

  const startEditNickname = () => {
    setNicknameInput(user?.nickname ?? '')
    setNicknameError('')
    setIsEditingNickname(true)
  }

  const saveNickname = async () => {
    const v = nicknameInput.trim()
    if (!v) {
      setNicknameError('닉네임을 입력해주세요')
      return
    }
    if (v.length > 20) {
      setNicknameError('닉네임은 1~20자 사이여야 합니다')
      return
    }
    if (!NICKNAME_REGEX.test(v)) {
      setNicknameError('한글, 영문, 숫자, -, _, () 만 가능합니다')
      return
    }
    await updateNickname(v)
    setIsEditingNickname(false)
  }

  const handleSave = async () => {
    await savePreference(form)
    alert('설정이 저장되었습니다.')
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">선호 설정</h1>

      {error && <ErrorMessage message={error} />}

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">닉네임</h2>
          {isEditingNickname ? (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => {
                    setNicknameInput(e.target.value)
                    if (nicknameError) setNicknameError('')
                  }}
                  maxLength={20}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                <button
                  onClick={saveNickname}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  저장
                </button>
                <button
                  onClick={() => setIsEditingNickname(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
              {nicknameError && (
                <p className="text-red-500 text-sm mt-1">{nicknameError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-800">{user?.nickname}</span>
              <button
                onClick={startEditNickname}
                className="text-sm text-purple-600 hover:underline"
              >
                수정
              </button>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">요리 실력</h2>
          <SkillLevelSelector
            value={form.cooking_skill ?? null}
            onChange={(v: CookingSkill) => setForm({ ...form, cooking_skill: v })}
          />
        </section>

        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">
            최대 조리 시간: {form.max_time}분
          </h2>
          <input
            type="range"
            min={10}
            max={120}
            step={10}
            value={form.max_time || 30}
            onChange={(e) => setForm({ ...form, max_time: parseInt(e.target.value) })}
            className="w-full"
          />
        </section>

        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">알레르기</h2>
          <AllergyTagInput
            value={form.allergies || []}
            onChange={(v) => setForm({ ...form, allergies: v })}
          />
        </section>

        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">보유 조리도구</h2>
          <CookingToolSelector
            value={form.cooking_tools || []}
            onChange={(v) => setForm({ ...form, cooking_tools: v })}
          />
        </section>

        <section>
          <h2 className="text-lg font-medium text-gray-700 mb-3">식습관 메모</h2>
          <textarea
            value={form.dietary_habits || ''}
            onChange={(e) => setForm({ ...form, dietary_habits: e.target.value })}
            placeholder="예: 채식 위주, 저탄고지..."
            className="w-full border border-gray-300 rounded-lg px-4 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </section>

        <button
          onClick={handleSave}
          className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700"
        >
          저장
        </button>
      </div>
    </div>
  )
}
