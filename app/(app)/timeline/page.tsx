'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarDays, FileText, FlaskConical, MessageCircleQuestion, Pill } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useTimeline } from '@/components/timeline/use-timeline'
import { TIMELINE_KINDS, filterTimeline, groupByMonth, type TimelineKind } from '@/lib/timeline/build'
import { formatDate, cn } from '@/lib/utils'

const ICONS: Record<TimelineKind, typeof FlaskConical> = {
  lab: FlaskConical,
  visit: CalendarDays,
  dose: Pill,
  document: FileText,
  question: MessageCircleQuestion,
}

const MONTHS_PER_PAGE = 6

export default function TimelinePage() {
  const { items, loading } = useTimeline()
  const [kinds, setKinds] = useState<Set<TimelineKind>>(new Set())
  const [monthsShown, setMonthsShown] = useState(MONTHS_PER_PAGE)

  const months = useMemo(() => groupByMonth(filterTimeline(items, kinds)), [items, kinds])
  const visible = months.slice(0, monthsShown)

  const toggle = (k: TimelineKind) => {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    setMonthsShown(MONTHS_PER_PAGE)
  }

  return (
    <>
      <Header title="Timeline" emphasis="Timeline" />
      <main className="px-4 py-5">
        <div className="mb-5 flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="Show">
          <Chip selected={kinds.size === 0} onClick={() => setKinds(new Set())}>All</Chip>
          {TIMELINE_KINDS.map((k) => (
            <Chip key={k.id} selected={kinds.has(k.id)} onClick={() => toggle(k.id)}>{k.label}</Chip>
          ))}
        </div>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : months.length === 0 ? (
          <p className="pt-16 text-center text-[15px] text-ink-2">Nothing on the timeline yet.</p>
        ) : (
          <div className="space-y-7">
            {visible.map((m) => (
              <section key={m.month} aria-labelledby={`m-${m.month}`}>
                <h2 id={`m-${m.month}`} className="glass sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 mb-1 px-4 py-1.5 font-serif text-lg text-ink">
                  {formatDate(`${m.month}-01`, 'MMMM yyyy')}
                </h2>
                <ol className="relative ml-[15px] border-l border-hair-2">
                  {m.items.map((it) => {
                    const Icon = ICONS[it.kind]
                    const body = (
                      <>
                        <span
                          className={cn(
                            'absolute -left-[15px] top-3 flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-vellum',
                            it.flag === 'abnormal' ? 'border-terra text-terra-dk' : it.flag === 'upcoming' ? 'border-sage text-sage' : 'border-hair-2 text-ink-3'
                          )}
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-xs text-ink-3 tabular">
                          {formatDate(it.date, 'EEE d MMM')}
                          {it.flag === 'upcoming' && <span className="ml-2 font-semibold text-sage">Upcoming</span>}
                        </p>
                        <p className="text-[15px] leading-snug text-ink">{it.title}</p>
                        {it.detail && (
                          <p className={cn('mt-0.5 line-clamp-2 text-[13px]', it.flag === 'abnormal' ? 'text-terra-dk' : 'text-ink-2')}>{it.detail}</p>
                        )}
                      </>
                    )
                    return (
                      <li key={it.key} className="relative pl-7">
                        {it.href ? (
                          <Link href={it.href} className="block rounded-btn py-2.5 pr-2 transition-colors hover:bg-wash">{body}</Link>
                        ) : (
                          <div className="py-2.5">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
            {months.length > monthsShown && (
              <Button variant="secondary" className="w-full" onClick={() => setMonthsShown((n) => n + MONTHS_PER_PAGE)}>
                Show earlier months
              </Button>
            )}
          </div>
        )}
      </main>
    </>
  )
}
