'use client'

import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  status?: 'good' | 'warning' | 'danger'
  onClick?: () => void
}

const statusEdge = {
  good: 'border-l-sage',
  warning: 'border-l-terra/60',
  danger: 'border-l-terra',
} as const

/** Interactive card treatment: hot hairline + lift on hover/press. */
export const interactiveCard =
  'cursor-pointer transition-[border-color,box-shadow,transform] duration-300 ease-editorial hover:border-hair-hot hover:shadow-lift active:border-hair-hot active:shadow-lift active:translate-y-px'

export function Card({ children, className, status, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-hair bg-vellum p-4',
        status && `border-l-2 ${statusEdge[status]}`,
        onClick && interactiveCard,
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-3', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('font-serif text-lg font-medium leading-snug tracking-[-.015em] text-ink', className)}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(className)}>{children}</div>
}
