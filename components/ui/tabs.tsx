'use client'

import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}

/** Chip row: recess pills; the selected chip is ink with a small terra dot. */
export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn('flex gap-2 overflow-x-auto scrollbar-hide', className)}>
      {tabs.map((tab) => (
        <Chip
          key={tab.id}
          role="tab"
          selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </Chip>
      ))}
    </div>
  )
}

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

export function Chip({ selected, className, children, ...props }: ChipProps) {
  // Tabs expose selection with aria-selected; standalone chips act as toggles.
  const state = props.role === 'tab' ? { 'aria-selected': selected } : { 'aria-pressed': selected }
  return (
    <button
      type="button"
      {...state}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
        'transition-colors duration-200',
        selected
          ? 'border-ink bg-ink text-canvas'
          : 'border-hair bg-recess text-ink-2 hover:border-hair-hot hover:text-ink',
        className
      )}
      {...props}
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-terra" aria-hidden />}
      {children}
    </button>
  )
}
