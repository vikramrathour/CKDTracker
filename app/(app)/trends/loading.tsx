import { ChartSkeleton } from '@/components/ui/skeleton'

export default function TrendsLoading() {
  return (
    <div className="px-4 py-4 space-y-4">
      <ChartSkeleton />
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  )
}
