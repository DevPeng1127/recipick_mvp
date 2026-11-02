import { useId, useState, type ReactNode } from 'react'

interface Props {
  label: string
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  className?: string
}

export default function HelpDisclosure({ label, title, children, action, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return <div className={`min-w-0 ${className}`}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0">{title}</div>
        <button type="button" aria-label={`${label} 도움말`} aria-expanded={open} aria-controls={id}
          onClick={() => setOpen(value => !value)}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${open ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-purple-50 hover:text-purple-700'}`}>
          <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-semibold">?</span>
        </button>
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </div>
    <div id={id} hidden={!open} className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-600 break-words space-y-2">
      {children}
    </div>
  </div>
}
