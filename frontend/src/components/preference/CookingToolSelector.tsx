interface CookingToolSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

const commonTools = [
  '프라이팬', '냄비', '오븐', '전자레인지',
  '에어프라이어', '믹서기', '토스터', '그릴',
  '압력밥솥', '인덕션', '가스레인지',
]

export default function CookingToolSelector({ value, onChange }: CookingToolSelectorProps) {
  const toggleTool = (tool: string) => {
    if (value.includes(tool)) {
      onChange(value.filter((t) => t !== tool))
    } else {
      onChange([...value, tool])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {commonTools.map((tool) => (
        <button
          key={tool}
          type="button"
          onClick={() => toggleTool(tool)}
          className={`text-sm px-3 py-2 rounded-lg transition ${
            value.includes(tool)
              ? 'bg-purple-100 text-purple-700 border border-purple-300'
              : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-purple-300'
          }`}
        >
          {tool}
        </button>
      ))}
    </div>
  )
}
