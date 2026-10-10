import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-btn bg-recess', className)} />
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-card border border-hair bg-vellum p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="space-y-3 rounded-card border border-hair bg-vellum p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

/** Mirrors the ruled records list. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border-t border-hair-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 border-b border-hair-2 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
