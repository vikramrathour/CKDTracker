'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { ALL_TESTS } from '@/lib/constants/test-panels'
import { toLabValue } from '@/lib/parsing/metropolis'
import { cn } from '@/lib/utils'
import { valueStatus } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabValue } from '@/lib/types/lab-record'

/** Re-flag a value against its own printed range (falling back to REFERENCE_RANGES). */
export function withValue(v: LabValue, value: number): LabValue {
  const ref = REFERENCE_RANGES[v.testName]
  const min = v.referenceMin ?? ref?.min
  const max = v.referenceMax ?? ref?.max
  return {
    ...v,
    value,
    isAbnormal: (min != null && value < min) || (max != null && value > max),
  }
}

/**
 * Editable list of lab values: tap a value to change it, × to remove, and
 * add any REFERENCE_RANGES test that's missing. Used by the extraction review
 * and the record edit screen.
 */
export function ValuesEditor({ values, onChange }: { values: LabValue[]; onChange: (next: LabValue[]) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  // Highlight against the patient's targets; the stored isAbnormal stays the lab's own flag.
  const { targetMap } = useTargets()
  const [newTest, setNewTest] = useState('')
  const [newValue, setNewValue] = useState('')

  const commit = (idx: number, raw: string) => {
    const n = parseFloat(raw)
    setEditingIdx(null)
    if (!Number.isFinite(n)) return
    onChange(values.map((v, i) => (i === idx ? withValue(v, n) : v)))
  }

  const present = new Set(values.map((v) => v.testName))
  const addable = ALL_TESTS.filter((t) => !present.has(t) && REFERENCE_RANGES[t])

  const add = () => {
    const n = parseFloat(newValue)
    const lv = newTest && Number.isFinite(n) ? toLabValue(newTest, n) : null
    if (!lv) return
    onChange([...values, lv])
    setNewTest('')
    setNewValue('')
  }

  return (
    <div>
      <ul className="border-t border-hair-2">
        {values.map((val, idx) => {
          const flagged = valueStatus(val.testName, val.value, val, targetMap) !== 'good'
          return (
          <li
            key={val.testName}
            className={cn('flex min-h-[48px] items-center gap-2.5 border-b border-hair-2 py-1.5', flagged && 'bg-terra-pale/50')}
          >
            <span className={cn('ml-1 h-2 w-2 flex-shrink-0 rounded-full', flagged ? 'bg-terra' : 'bg-sage')} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{REFERENCE_RANGES[val.testName]?.label ?? val.testName}</span>
            {editingIdx === idx ? (
              <input
                type="number"
                inputMode="decimal"
                step="any"
                defaultValue={val.value}
                autoFocus
                aria-label={`${val.testName} value`}
                onBlur={(e) => commit(idx, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commit(idx, (e.target as HTMLInputElement).value)
                  }
                  if (e.key === 'Escape') setEditingIdx(null)
                }}
                className="field w-24 px-2 py-1.5 text-right tabular"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingIdx(idx)}
                aria-label={`Edit ${val.testName}: ${val.value}`}
                className={cn(
                  'num min-h-[40px] rounded-btn px-2 text-[17px] font-medium underline decoration-hair-2 decoration-dotted underline-offset-4 hover:bg-wash',
                  flagged ? 'text-terra-dk' : 'text-ink'
                )}
              >
                {val.value}
              </button>
            )}
            {/* Long units (mL/min/1.73m²) wrap after a slash instead of truncating. */}
            <span className="w-16 flex-shrink-0 break-words text-right text-[11px] leading-tight text-ink-3">
              {(val.unit ?? '').replace(/\//g, '/\u200b')}
            </span>
            <button
              type="button"
              onClick={() => onChange(values.filter((_, i) => i !== idx))}
              aria-label={`Remove ${val.testName}`}
              className="flex h-10 w-9 items-center justify-center rounded-btn text-base text-ink-3 transition-colors hover:bg-critical-pale hover:text-critical"
            >
              ×
            </button>
          </li>
          )
        })}
      </ul>

      {addable.length > 0 && (
        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="add-test" className="label mb-1.5 block text-ink-3">Add a test</label>
            <select id="add-test" className="field" value={newTest} onChange={(e) => setNewTest(e.target.value)}>
              <option value="">Choose…</option>
              {addable.map((t) => (
                <option key={t} value={t}>{REFERENCE_RANGES[t].label}</option>
              ))}
            </select>
          </div>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            aria-label="Value"
            placeholder={newTest ? REFERENCE_RANGES[newTest]?.unit || 'value' : 'value'}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="field w-24 tabular"
          />
          <Button variant="secondary" size="md" aria-label="Add test" onClick={add} disabled={!newTest || !newValue}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
