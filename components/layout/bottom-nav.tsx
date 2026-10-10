'use client'

import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, TrendingUp, FlaskConical, FileText, Pill } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/trends', label: 'Trends', icon: TrendingUp },
  { href: '/analysis', label: 'Analysis', icon: FlaskConical },
  { href: '/records', label: 'Records', icon: FileText },
  { href: '/medications', label: 'Meds', icon: Pill },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      aria-label="Primary"
      className="glass fixed bottom-0 left-0 right-0 z-40 border-t border-hair pb-safe"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200',
                isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.1 : 1.7} />
              <span className={cn('text-[11px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>
                {item.label}
              </span>
              <span
                aria-hidden
                className={cn(
                  'absolute bottom-1.5 h-1 w-1 rounded-full bg-terra transition-opacity duration-300',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
