'use client'

import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePatient } from '@/components/providers/patient-provider'

/** Shown in place of an editing screen when the caller is a viewer on the active patient. */
export function ViewOnlyNotice({ action = 'add reports' }: { action?: string }) {
  const router = useRouter()
  const { activePatient } = usePatient()
  return (
    <div className="pt-16 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-recess text-ink-3" aria-hidden>
        <Eye className="h-5 w-5" />
      </span>
      <h2 className="font-serif text-[1.625rem] font-normal leading-tight tracking-[-.02em] text-ink">
        View <em className="italic text-terra-dk">only</em>
      </h2>
      <p className="mx-auto mt-3 max-w-[34ch] text-[15px] text-ink-2">
        You can see {activePatient ? `${activePatient.displayName}’s` : 'these'} records, but only the owner or an editor can {action}.
      </p>
      <Button variant="secondary" className="mt-6" onClick={() => router.push('/dashboard')}>
        Back to dashboard
      </Button>
    </div>
  )
}
