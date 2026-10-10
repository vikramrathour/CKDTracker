'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto mb-5 h-10 w-10 text-terra" strokeWidth={1.6} />
        <h2 className="mb-2 font-serif text-[1.75rem] font-normal leading-tight tracking-[-.02em] text-ink">
          Something went <em className="italic text-terra-dk">wrong</em>
        </h2>
        <p className="mb-7 text-sm text-ink-2">{error.message}</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  )
}
