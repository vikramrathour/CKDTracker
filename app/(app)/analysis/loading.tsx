import { CardSkeleton, ChartSkeleton } from '@/components/ui/skeleton'

export default function AnalysisLoading() {
  return (
    <div className="px-4 py-4 space-y-4">
      <CardSkeleton />
      <ChartSkeleton />
      <CardSkeleton />
    </div>
  )
}
