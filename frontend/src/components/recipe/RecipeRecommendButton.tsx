interface RecipeRecommendButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled?: boolean
}

export default function RecipeRecommendButton({
  onClick,
  isLoading,
  disabled,
}: RecipeRecommendButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition"
    >
      {isLoading ? '레시피 고민 중...' : 'AI 레시피 추천받기'}
    </button>
  )
}
