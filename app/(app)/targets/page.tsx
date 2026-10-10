'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { TargetEditor } from '@/components/targets/target-editor'
import { AlertRulesSection } from '@/components/targets/alert-rules-section'
import type { TargetFormValues } from '@/components/targets/target-schema'
import { useTargets } from '@/lib/hooks/use-targets'
import { deleteTarget, saveTarget } from '@/lib/firebase/targets'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { COMMON_TARGET_TESTS, formatRange, hasTargetBounds } from '@/lib/calculations/targets'
import { cn } from '@/lib/utils'
import type { Target } from '@/lib/types/care'

/** Common tests first, then REFERENCE_RANGES order (panel by panel). */
const ORDERED_TESTS: string[] = [
  ...COMMON_TARGET_TESTS,
  ...Object.keys(REFERENCE_RANGES).filter((t) => !(COMMON_TARGET_TESTS as readonly string[]).includes(t)),
]

export default function TargetsPage() {
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { showToast } = useToast()
  const { targets, targetMap, loading, error } = useTargets()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ORDERED_TESTS
    return ORDERED_TESTS.filter((t) => {
      const r = REFERENCE_RANGES[t]
      return t.toLowerCase().includes(q) || r?.label.toLowerCase().includes(q) || r?.panel.includes(q)
    })
  }, [query])

  const setTargets = targets.filter((t) => hasTargetBounds(t))
  const editingTarget: Target | null = editing ? (targets.find((t) => t.testName === editing) ?? null) : null

  const onSave = async (v: TargetFormValues) => {
    if (!pid || !editing) return
    try {
      await saveTarget(pid, editing, {
        min: v.min,
        max: v.max,
        unit: REFERENCE_RANGES[editing]?.unit ?? '',
        setBy: v.setBy,
        notes: v.notes,
      })
      showToast('success', `Target saved for ${REFERENCE_RANGES[editing]?.label ?? editing}`)
      setEditing(null)
    } catch (err) {
      console.error('Save target failed', err)
      showToast('error', 'Could not save the target.')
    }
  }

  const onRemove = async () => {
    if (!pid || !editing) return
    try {
      await deleteTarget(pid, editing)
      showToast('success', 'Target removed')
      setEditing(null)
    } catch (err) {
      console.error('Remove target failed', err)
      showToast('error', 'Could not remove the target.')
    }
  }

  const row = (testName: string) => {
    const ref = REFERENCE_RANGES[testName]
    const target = targetMap[testName]
    const has = hasTargetBounds(target)
    const content = (
      <>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">{ref?.label ?? testName}</div>
          <div className="text-[12px] text-ink-3 tabular">
            Lab range {ref ? `${formatRange(ref)} ${ref.unit}` : '—'}
            {has && target?.setBy ? ` · set by ${target.setBy}` : ''}
          </div>
        </div>
        {has ? (
          <Badge variant="good" uppercase={false}>
            {formatRange(target!)} {ref?.unit}
          </Badge>
        ) : (
          canEdit && <span className="text-[12px] font-semibold text-ink-3">Set</span>
        )}
        {canEdit && <ChevronRight aria-hidden className="h-4 w-4 flex-shrink-0 text-ink-3" />}
      </>
    )
    return (
      <li key={testName} className="border-t border-hair first:border-t-0">
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(testName)}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-btn px-2 py-3 text-left transition-colors hover:bg-wash"
          >
            {content}
          </button>
        ) : (
          <div className="flex items-center gap-3 py-3">{content}</div>
        )}
      </li>
    )
  }

  return (
    <>
      <Header title="Targets" emphasis="Targets" subtitle="Ranges set by your doctor" />
      <main className="space-y-3.5 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          A target replaces the lab’s printed range in scores, charts and alerts, e.g. a tacrolimus range of 5–8, or an
          eGFR goal that suits a transplanted kidney.
        </p>

        {error && <p role="alert" className="text-sm text-critical">{error}</p>}

        {loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {setTargets.length > 0 && (
              <section className="rounded-card border border-hair bg-vellum px-4 pb-1 pt-4">
                <h2 className="label mb-1 text-ink-3">Your targets · {setTargets.length}</h2>
                <ul>{setTargets.map((t) => row(t.testName))}</ul>
              </section>
            )}

            <section className="rounded-card border border-hair bg-vellum px-4 pb-1 pt-4">
              <h2 className="label mb-2 text-ink-3">All tests</h2>
              <div className="relative mb-2">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="field pl-9"
                  placeholder="Search tests"
                  aria-label="Search tests"
                />
              </div>
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-3">No test matches “{query}”.</p>
              ) : (
                <ul className={cn(!query && 'pb-1')}>{filtered.map(row)}</ul>
              )}
            </section>
          </>
        )}

        <AlertRulesSection canEdit={canEdit} />

        {!canEdit && <p className="text-center text-xs text-ink-3">View only: owners and editors can change targets and alert rules.</p>}
      </main>

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing ? `${REFERENCE_RANGES[editing]?.label ?? editing} target` : 'Target'}
      >
        {editing && (
          <TargetEditor
            key={editing}
            testName={editing}
            target={editingTarget}
            onSave={onSave}
            onRemove={onRemove}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  )
}
