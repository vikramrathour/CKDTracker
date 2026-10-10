'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        'w-[calc(100%-2rem)] max-w-md rounded-card border border-hair bg-vellum p-0 text-ink shadow-lift',
        'backdrop:bg-[rgba(12,18,26,.45)] backdrop:backdrop-blur-[2px]',
        className
      )}
    >
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-serif text-xl font-medium tracking-[-.015em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-wash hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
