'use client'

import Link from 'next/link'
import { CalendarClock, ChevronRight, ClipboardList } from 'lucide-react'
import { interactiveCard } from '@/components/ui/card'
import { formatDate, cn } from '@/lib/utils'
import type { VisitRecord } from '@/lib/visits/types'

export function visitWhen(v: Pick<VisitRecord, 'visitDate' | 'visitTime'>, fmt = 'EEE d MMM yyyy'): string {
  if (!v.visitDate) return 'No date'
  return `${formatDate(v.visitDate, fmt)}${v.visitTime ? ` · ${v.visitTime}` : ''}`
}

/**
 * Upcoming visit: card with a prep shortcut. `showEyebrow={false}` drops the
 * "Upcoming" label when the card already sits under an Upcoming heading.
 */
export function UpcomingVisitCard({ visit, showEyebrow = true }: { visit: VisitRecord; showEyebrow?: boolean }) {
  const who = [visit.doctorName, visit.hospital].filter(Boolean).join(', ')
  return (
    <div className={cn('rounded-card border border-hair bg-vellum p-4', interactiveCard)}>
      <Link href={`/visits/${visit.id}`} className="block">
        {showEyebrow && (
          <p className="eyebrow mb-1.5 flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Upcoming
          </p>
        )}
        <h3 className="font-serif text-[1.375rem] font-normal leading-tight tracking-[-.015em] text-ink tabular">
          {visitWhen(visit)}
        </h3>
        {who && <p className="mt-0.5 truncate text-[13px] text-ink-2">{who}</p>}
        {visit.purpose && <p className="mt-1 line-clamp-2 text-sm text-ink-3">{visit.purpose}</p>}
      </Link>
      <Link href={`/visits/${visit.id}/prep`} className="tlink mt-3 text-[13px]">
        <ClipboardList className="h-4 w-4" aria-hidden /> Prepare for this visit
      </Link>
    </div>
  )
}

/** Past visit: ruled list row. */
export function PastVisitRow({ visit }: { visit: VisitRecord }) {
  const who = [visit.doctorName, visit.hospital].filter(Boolean).join(', ')
  return (
    <li className="border-b border-hair-2">
      <Link href={`/visits/${visit.id}`} className="flex min-h-[56px] items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg leading-tight text-ink tabular">{visitWhen(visit, 'd MMM yyyy')}</p>
          <p className="truncate text-[13px] text-ink-3">{[who, visit.purpose].filter(Boolean).join(' · ') || 'Visit'}</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  )
}
