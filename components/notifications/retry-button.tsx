'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RetryButton() {
  return (
    <Button variant="secondary" onClick={() => window.location.reload()}>
      <RefreshCw className="h-4 w-4" aria-hidden />
      Try again
    </Button>
  )
}
