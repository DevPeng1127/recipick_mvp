interface EmptyStateProps {
  icon: string
  title: string
  description?: string
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-medium text-gray-600">{title}</h3>
      {description && <p className="text-gray-400 mt-1">{description}</p>}
    </div>
  )
}
