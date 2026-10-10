'use client'

import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  status?: 'good' | 'warning' | 'danger'
  onClick?: () => void
}

export function Card({ children, className, status, onClick }: CardProps) {
  const borderColor = status
    ? {
        good: 'border-l-health-good',
        warning: 'border-l-health-warning',
        danger: 'border-l-health-danger',
      }[status]
    : ''

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-sm border border-gray-100 p-4',
        status && `border-l-4 ${borderColor}`,
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-3', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold text-gray-900', className)}>{children}</h3>
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(className)}>{children}</div>
}
