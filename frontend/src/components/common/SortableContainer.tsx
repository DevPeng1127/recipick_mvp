import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortableItemProps {
  id: number
  children: React.ReactNode
}

function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* 드래그 핸들 - 카드 안쪽 왼쪽 중앙 */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute top-1/2 -translate-y-1/2 left-2 z-10 w-7 h-7 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors p-0"
        aria-label="드래그하여 순서 변경"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="6" cy="4" r="1.75" />
          <circle cx="10" cy="4" r="1.75" />
          <circle cx="6" cy="8" r="1.75" />
          <circle cx="10" cy="8" r="1.75" />
          <circle cx="6" cy="12" r="1.75" />
          <circle cx="10" cy="12" r="1.75" />
        </svg>
      </button>
      {children}
    </div>
  )
}

interface SortableContainerProps<T extends { id: number }> {
  items: T[]
  onReorder: (orderedIds: number[]) => void
  renderItem: (item: T) => React.ReactNode
  className?: string
}

export default function SortableContainer<T extends { id: number }>({
  items,
  onReorder,
  renderItem,
  className,
}: SortableContainerProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)
      const reordered = arrayMove(items, oldIndex, newIndex)
      onReorder(reordered.map((item) => item.id))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
