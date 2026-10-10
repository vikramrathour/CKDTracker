'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { MORE_ROUTES, type MoreRoute } from '@/components/layout/more-routes'

const GROUPS: MoreRoute['group'][] = ['Health', 'Visits & files', 'People & account']

export default function MorePage() {
  return (
    <>
      <Header title="More" />
      <main className="space-y-6 px-4 py-4">
        {GROUPS.map((group) => (
          <section key={group}>
            <h2 className="label mb-2 text-ink-3">{group}</h2>
            <ul className="overflow-hidden rounded-card border border-hair bg-vellum">
              {MORE_ROUTES.filter((r) => r.group === group).map((route) => {
                const Icon = route.icon
                return (
                  <li key={route.href} className="border-t border-hair first:border-t-0">
                    <Link
                      href={route.href}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-wash"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-terra-dk" strokeWidth={1.8} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[1.0625rem] leading-tight text-ink">{route.label}</span>
                        <span className="block truncate text-[13px] text-ink-3">{route.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  )
}
