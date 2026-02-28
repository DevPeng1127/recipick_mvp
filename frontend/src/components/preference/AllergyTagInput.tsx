import { useState } from 'react'

interface AllergyTagInputProps {
  value: string[]
  onChange: (value: string[]) => void
}

const commonAllergies = ['우유', '달걀', '밀', '땅콩', '견과류', '갑각류', '대두', '생선']

export default function AllergyTagInput({ value, onChange }: AllergyTagInputProps) {
  const [input, setInput] = useState('')

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(input)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {commonAllergies.map((allergy) => (
          <button
            key={allergy}
            type="button"
            onClick={() =>
              value.includes(allergy) ? removeTag(allergy) : addTag(allergy)
            }
            className={`text-sm px-3 py-1 rounded-full transition ${
              value.includes(allergy)
                ? 'bg-red-100 text-red-700 border border-red-300'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-red-300'
            }`}
          >
            {allergy}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="직접 입력 후 Enter"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-sm bg-red-50 text-red-600 px-2 py-1 rounded-full"
            >
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-800">
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
