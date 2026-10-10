import { ListSkeleton } from '@/components/ui/skeleton'

export default function RecordsLoading() {
  return (
    <div className="px-4 py-4">
      <ListSkeleton rows={5} />
    </div>
  )
}
