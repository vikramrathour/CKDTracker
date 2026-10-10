'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { useAuth } from '@/components/providers/auth-provider'
import { deleteLabRecord } from '@/lib/firebase/firestore'
import { Badge } from '@/components/ui/badge'
import { ListSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { useState } from 'react'

export default function RecordsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { records, loading, refetch } = useLabRecords()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this record?')) return
    setDeleting(id)
    try {
      await deleteLabRecord(user.uid, id)
      await refetch()
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Test History" />
        <main className="px-4 py-4"><ListSkeleton rows={5} /></main>
      </>
    )
  }

  return (
    <>
      <Header
        title="Test History"
        actions={
          <button
            onClick={() => router.push('/records/new')}
            className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      <main className="px-4 py-4">
        {records.length === 0 ? (
          <div className="text-center pt-20">
            <div className="text-sm text-gray-500">No records yet. Add your first lab report.</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...records].reverse().map((record) => {
              const abnormals = record.values.filter((v) => v.isAbnormal)
              const cr = record.values.find((v) => v.testName === 'Creatinine')
              const egfr = record.values.find((v) => v.testName === 'eGFR')
              const tac = record.values.find((v) => v.testName === 'Tacrolimus')
              const k = record.values.find((v) => v.testName === 'Potassium')
              const hb = record.values.find((v) => v.testName === 'Hemoglobin')

              return (
                <div
                  key={record.id}
                  className="bg-white rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[15px] font-semibold text-gray-900">
                        {formatDate(record.recordDate, 'dd MMM yy')}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {record.labName || '—'} · {record.values.length} tests
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(record.id)}
                      disabled={deleting === record.id}
                      className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-2.5 py-1 hover:bg-red-100"
                    >
                      {deleting === record.id ? '...' : '×'}
                    </button>
                  </div>

                  {abnormals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {abnormals.slice(0, 5).map((v) => (
                        <Badge key={v.testName} variant="danger">
                          {v.testName}: {v.value}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 mt-2">
                    {cr && <span className="text-xs text-gray-500">Cr: <strong>{cr.value}</strong></span>}
                    {egfr && <span className="text-xs text-gray-500">eGFR: <strong>{egfr.value}</strong></span>}
                    {tac && <span className="text-xs text-gray-500">Tac: <strong>{tac.value}</strong></span>}
                    {k && <span className="text-xs text-gray-500">K⁺: <strong>{k.value}</strong></span>}
                    {hb && <span className="text-xs text-gray-500">Hb: <strong>{hb.value}</strong></span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
