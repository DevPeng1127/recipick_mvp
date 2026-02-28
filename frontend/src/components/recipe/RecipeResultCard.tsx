interface RecipeResultCardProps {
  recipe: string
}

export default function RecipeResultCard({ recipe }: RecipeResultCardProps) {
  if (!recipe) return null

  return (
    <div className="bg-white rounded-xl border-2 border-purple-200 p-6 mt-4">
      <div className="prose max-w-none whitespace-pre-wrap text-gray-700">
        {recipe}
      </div>
    </div>
  )
}
