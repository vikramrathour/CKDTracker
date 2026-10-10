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

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('flex overflow-x-auto scrollbar-hide gap-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors',
            activeTab === tab.id
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
