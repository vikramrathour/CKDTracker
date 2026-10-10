import { Loader2 } from 'lucide-react'

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Loader2 className="h-7 w-7 animate-spin text-terra" aria-label="Loading" />
    </div>
  )
}
