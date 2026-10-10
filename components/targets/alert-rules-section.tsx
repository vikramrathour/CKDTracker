'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { BellPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { FormField, fieldA11y } from '@/components/medications/form-field'
import { usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import { addAlertRule, deleteAlertRule, setAlertRuleEnabled, subscribeAlertRules } from '@/lib/firebase/alert-rules'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { AlertOperator, AlertRule } from '@/lib/types/care'
import { alertRuleFormSchema, type AlertRuleFormInput, type AlertRuleFormValues } from './alert-rule-schema'

const EMPTY: AlertRule[] = []

const OP_LABEL: Record<AlertOperator, string> = {
  above: 'Goes above',
  below: 'Goes below',
  'change-pct': 'Changes by more than',
  'outside-target': 'Leaves its usual range',
}

function describeRule(r: AlertRule): string {
  const unit = REFERENCE_RANGES[r.testName]?.unit ?? ''
  const name = REFERENCE_RANGES[r.testName]?.label ?? r.testName
  switch (r.op) {
    case 'above':
      return `${name} above ${r.threshold ?? '—'} ${unit}`.trim()
    case 'below':
      return `${name} below ${r.threshold ?? '—'} ${unit}`.trim()
    case 'change-pct':
      return `${name} changes more than ${r.threshold ?? '—'}% from baseline`
    case 'outside-target':
      return `${name} outside its usual range`
  }
}

/** Custom alert rules (patients/{pid}/alertRules), shown on the Targets page. */
export function AlertRulesSection({ canEdit }: { canEdit: boolean }) {
  const { pid } = usePatient()
  const { showToast } = useToast()
  const { data: rules, loading, error } = useSubscription<AlertRule[]>(
    pid,
    (next, fail) => subscribeAlertRules(pid as string, next, fail),
    EMPTY,
    'Failed to load alert rules'
  )
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (r: AlertRule) => {
    if (!pid) return
    setBusy(r.id)
    try {
      await setAlertRuleEnabled(pid, r.id, !r.enabled)
    } catch (err) {
      console.error('Toggle alert rule failed', err)
      showToast('error', 'Could not update the rule.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (r: AlertRule) => {
    if (!pid) return
    setBusy(r.id)
    try {
      await deleteAlertRule(pid, r.id)
      showToast('success', 'Alert rule removed')
    } catch (err) {
      console.error('Delete alert rule failed', err)
      showToast('error', 'Could not remove the rule.')
    } finally {
      setBusy(null)
    }
  }

  const onAdd = async (v: AlertRuleFormValues) => {
    if (!pid) return
    try {
      await addAlertRule(pid, v)
      showToast('success', 'Alert rule added')
      setAdding(false)
    } catch (err) {
      console.error('Add alert rule failed', err)
      showToast('error', 'Could not add the rule.')
    }
  }

  return (
    <section aria-labelledby="alert-rules-h" className="rounded-card border border-hair bg-vellum px-4 pb-3 pt-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="alert-rules-h" className="label text-ink-3">
          Alert rules{rules.length ? ` · ${rules.length}` : ''}
        </h2>
        {canEdit && (
          <Button variant="terra" size="sm" onClick={() => setAdding(true)} disabled={!pid}>
            <BellPlus className="h-4 w-4" aria-hidden />
            Add rule
          </Button>
        )}
      </div>
      <p className="mb-2 text-[13px] leading-relaxed text-ink-2">
        Your own warnings on top of the built-in ones, checked against the latest report.
      </p>

      {error && <p role="alert" className="text-sm text-critical">{error}</p>}

      {loading ? (
        <p className="py-3 text-sm text-ink-3">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="py-3 text-sm text-ink-3">No custom rules yet.</p>
      ) : (
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-t border-hair py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink tabular">{describeRule(r)}</div>
                {r.label && <div className="truncate text-[12px] text-ink-3">{r.label}</div>}
              </div>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={`${r.enabled ? 'Pause' : 'Resume'} rule: ${describeRule(r)}`}
                    onClick={() => toggle(r)}
                    disabled={busy === r.id}
                    className="rounded-btn px-1 disabled:opacity-50"
                  >
                    <Badge variant={r.enabled ? 'good' : 'neutral'} uppercase={false}>
                      {r.enabled ? 'On' : 'Paused'}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                    aria-label={`Delete rule: ${describeRule(r)}`}
                    className="flex h-11 w-11 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-critical-pale hover:text-critical disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : (
                <Badge variant={r.enabled ? 'good' : 'neutral'} uppercase={false}>
                  {r.enabled ? 'On' : 'Paused'}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New alert rule">
        {adding && <AlertRuleForm onSave={onAdd} onCancel={() => setAdding(false)} />}
      </Modal>
    </section>
  )
}

function AlertRuleForm({ onSave, onCancel }: { onSave: (v: AlertRuleFormValues) => Promise<void>; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AlertRuleFormInput, unknown, AlertRuleFormValues>({
    resolver: zodResolver(alertRuleFormSchema),
    defaultValues: { testName: 'Creatinine', op: 'above', threshold: '', label: '' },
  })
  const op = watch('op')
  const testName = watch('testName')
  const unit = op === 'change-pct' ? '%' : REFERENCE_RANGES[testName]?.unit ?? ''

  return (
    <form onSubmit={handleSubmit(onSave)} noValidate className="space-y-4">
      <FormField id="rule-test" label="Test" error={errors.testName?.message}>
        <select {...register('testName')} {...fieldA11y('rule-test', errors.testName?.message)} className="field">
          {Object.entries(REFERENCE_RANGES).map(([key, r]) => (
            <option key={key} value={key}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="rule-op" label="Alert when it" error={errors.op?.message}>
        <select {...register('op')} {...fieldA11y('rule-op', errors.op?.message)} className="field">
          {(Object.keys(OP_LABEL) as AlertOperator[]).map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
      </FormField>
      {op !== 'outside-target' && (
        <FormField
          id="rule-threshold"
          label={`${op === 'change-pct' ? 'Percent' : 'Value'}${unit ? ` (${unit})` : ''}`}
          error={errors.threshold?.message}
          help={op === 'change-pct' ? 'Compared with the median of the previous few reports.' : undefined}
        >
          <input
            {...register('threshold')}
            {...fieldA11y('rule-threshold', errors.threshold?.message, op === 'change-pct')}
            className="field tabular"
            inputMode="decimal"
            placeholder={op === 'change-pct' ? '20' : ''}
          />
        </FormField>
      )}
      <FormField id="rule-label" label="Note (optional)" error={errors.label?.message}>
        <input
          {...register('label')}
          {...fieldA11y('rule-label', errors.label?.message)}
          className="field"
          maxLength={80}
          placeholder="e.g. Call the transplant clinic"
        />
      </FormField>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Add rule
        </Button>
      </div>
    </form>
  )
}
