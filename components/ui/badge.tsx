'use client'

import { cn } from '@/lib/utils'

type BadgeVariant = 'good' | 'warning' | 'danger' | 'neutral' | 'info'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
  /** Tag style is uppercase; turn off for data such as test names (eGFR, K⁺). */
  uppercase?: boolean
}

// Tag treatment from the site: 11px uppercase, 4px radius, pale ground.
const variantStyles: Record<BadgeVariant, string> = {
  good: 'bg-sage-pale text-sage',
  warning: 'bg-terra-pale text-terra-dk',
  danger: 'bg-terra-pale text-terra-dk ring-1 ring-inset ring-terra/50',
  neutral: 'bg-recess text-ink-2',
  info: 'bg-recess text-ink',
}

export function Badge({ children, variant = 'neutral', className, uppercase = true }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-btn px-2 py-[3px] leading-tight tabular',
        uppercase ? 'text-[11px] font-bold uppercase tracking-[.08em]' : 'text-xs font-semibold',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
