'use client'

import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, MessageCircle, CalendarClock, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MORE_ROUTES } from './more-routes'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, match: ['/dashboard'] },
  { href: '/records', label: 'Records', icon: FileText, match: ['/records', '/upload'] },
  { href: '/chat', label: 'Chat', icon: MessageCircle, match: ['/chat'] },
  { href: '/visits', label: 'Visits', icon: CalendarClock, match: ['/visits', '/questions'] },
  { href: '/more', label: 'More', icon: LayoutGrid, match: ['/more', ...MORE_ROUTES.map((r) => r.href)] },
]

function isActivePath(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  // First match wins, so a route listed under two tabs (e.g. /questions under
  // Visits and in the More list) only lights up one of them.
  const activeHref = navItems.find((item) => isActivePath(pathname, item.match))?.href

  return (
    <nav
      aria-label="Primary"
      className="glass fixed bottom-0 left-0 right-0 z-40 border-t border-hair pb-safe"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === activeHref

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
