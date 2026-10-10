'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastData {
  id: string
  type: ToastType
  message: string
}

interface ToastProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-sage" aria-hidden />,
  error: <XCircle className="h-5 w-5 text-critical" aria-hidden />,
  info: <Info className="h-5 w-5 text-terra-dk" aria-hidden />,
}

const edge: Record<ToastType, string> = {
  success: 'border-l-sage',
  error: 'border-l-critical',
  info: 'border-l-terra',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-3 rounded-card border border-l-2 border-hair bg-vellum px-4 py-3 shadow-lift animate-slide-in',
        edge[toast.type]
      )}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-2 flex h-9 w-9 items-center justify-center rounded-btn text-ink-3 hover:bg-wash hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
