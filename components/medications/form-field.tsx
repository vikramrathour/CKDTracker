'use client'

import { cn } from '@/lib/utils'

/**
 * Label + control + error/help line, used by the medication, target and
 * vitals forms. The control gets `aria-describedby`/`aria-invalid` via the
 * ids exported here (pass `describedBy(id)` to it).
 */
export function FormField({
  id,
  label,
  error,
  help,
  className,
  children,
}: {
  id: string
  label: React.ReactNode
  error?: string
  help?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="label mb-1.5 block text-ink-3">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1 text-xs text-critical">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-msg`} className="mt-1 text-xs text-ink-3">
          {help}
        </p>
      ) : null}
    </div>
  )
}

/** a11y props for the control inside a FormField. */
export function fieldA11y(id: string, error?: string, hasHelp = false) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hasHelp ? `${id}-msg` : undefined,
  } as const
}
