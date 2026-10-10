'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Activity,
  FilePlus2,
  FileText,
  Pill,
  Stethoscope,
  Target,
  UserMinus,
  UserPlus,
  UserCog,
  Upload,
  MessageCircleQuestion,
  Mail,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { listActivity, type CareActivityEntry } from '@/lib/firebase/invites'
import { formatPersonName } from '@/lib/phone'
import { humanizeYmdDates } from '@/lib/utils'

/** Verb phrase per action; unknown actions fall back to the stored summary. */
const ACTIONS: Record<string, { verb: string; icon: LucideIcon }> = {
  'patient.created': { verb: 'created this profile', icon: UserPlus },
  'patient.updated': { verb: 'updated the profile details', icon: UserCog },
  'member.invited': { verb: 'sent an invite', icon: Mail },
  'invite.revoked': { verb: 'cancelled an invite', icon: Mail },
  'member.added': { verb: 'joined the care circle', icon: UserPlus },
  'member.role-changed': { verb: 'changed someone’s role', icon: UserCog },
  'member.removed': { verb: 'removed someone', icon: UserMinus },
  'member.left': { verb: 'left the care circle', icon: UserMinus },
  'record.added': { verb: 'added a report', icon: FilePlus2 },
  'record.updated': { verb: 'edited a report', icon: FileText },
  'record.deleted': { verb: 'deleted a report', icon: FileText },
  'medication.added': { verb: 'added a medication', icon: Pill },
  'medication.updated': { verb: 'updated a medication', icon: Pill },
  'medication.deleted': { verb: 'removed a medication', icon: Pill },
  'document.uploaded': { verb: 'uploaded a document', icon: Upload },
  'visit.added': { verb: 'logged a doctor visit', icon: Stethoscope },
  'question.added': { verb: 'added a question for the doctor', icon: MessageCircleQuestion },
  'target.updated': { verb: 'updated a target range', icon: Target },
}

function when(iso?: string): string {
  if (!iso) return 'just now'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (Date.now() - d.getTime() < 60_000) return 'just now'
  return `${formatDistanceToNowStrict(d)} ago`
}

/**
 * Latest `limit` entries of patients/{pid}/activity (viewer-readable).
 * Entries carry names and short summaries only, never lab values.
 */
export function ActivityFeed({ pid, limit = 50, initiallyShown = 8, refreshKey = 0 }: {
  pid: string
  limit?: number
  initiallyShown?: number
  /** Bump to reload (e.g. after an action on the same page). */
  refreshKey?: number
}) {
  const [entries, setEntries] = useState<CareActivityEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    try {
      setEntries(await listActivity(pid, limit))
      setError(false)
    } catch (err) {
      console.error('Activity load failed', err)
      setError(true)
    }
  }, [pid, limit])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (error) {
    return (
      <p className="text-sm text-ink-3">
        Couldn’t load recent activity. <button type="button" className="tlink" onClick={load}>Try again</button>
      </p>
    )
  }
  if (!entries) return <ListSkeleton rows={3} />
  if (entries.length === 0) return <p className="text-sm text-ink-3">Nothing yet. Changes by anyone in the care circle show up here.</p>

  const shown = showAll ? entries : entries.slice(0, initiallyShown)

  return (
    <div>
      <ol className="space-y-3.5">
        {shown.map((e) => {
          const meta = ACTIONS[e.action]
          const Icon = meta?.icon ?? Activity
          // Older entries stored raw ISO dates ("Added a visit for 2026-08-12").
          const summary = e.summary ? humanizeYmdDates(e.summary) : ''
          return (
            <li key={e.id} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-recess text-ink-3" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{e.actorName ? formatPersonName(e.actorName) : 'Someone'}</span>{' '}
                  {meta ? meta.verb : summary || 'made a change'}
                </p>
                {meta && summary && <p className="text-[13px] text-ink-2">{summary}</p>}
                <p className="text-xs text-ink-3">
                  <time dateTime={e.createdAt}>{when(e.createdAt)}</time>
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {!showAll && entries.length > initiallyShown && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll(true)}>
          Show all {entries.length}
        </Button>
      )}
    </div>
  )
}
