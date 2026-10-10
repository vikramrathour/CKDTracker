'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePatient } from '@/components/providers/patient-provider'
import { cn } from '@/lib/utils'
import type { PatientMembership } from '@/lib/types/member'

const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' } as const

function describe(p: PatientMembership): string {
  if (p.relationship === 'self') return 'Your profile'
  if (p.role === 'owner') return 'Someone you care for'
  return 'Shared with you'
}

/**
 * Compact "whose reports" switcher shown in the header when the user belongs
 * to more than one patient. Opens a sheet listing every profile plus "Add someone".
 */
export function PatientSwitcher({ className }: { className?: string }) {
  const { patients, activePatient, setActivePatient } = usePatient()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (patients.length < 2 || !activePatient) return null

  const choose = async (pid: string) => {
    setOpen(false)
    if (pid !== activePatient.id) await setActivePatient(pid)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Viewing ${activePatient.displayName}. Switch profile`}
        className={cn(
          '-mx-1 inline-flex max-w-full items-center gap-0.5 rounded-btn px-1 text-xs font-semibold leading-tight text-terra-dk transition-colors hover:bg-terra-pale',
          className
        )}
      >
        <span className="truncate">{activePatient.displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Whose reports?">
        <ul className="-mx-1 border-t border-hair-2" role="list">
          {patients.map((p) => {
            const active = p.id === activePatient.id
            return (
              <li key={p.id} className="border-b border-hair-2">
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  aria-current={active ? 'true' : undefined}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-btn px-1 py-2.5 text-left transition-colors hover:bg-wash"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-lg font-medium leading-snug tracking-[-.01em] text-ink">
                      {p.displayName}
                    </span>
                    <span className="block truncate text-[13px] text-ink-3">{describe(p)}</span>
                  </span>
                  {p.role !== 'owner' && (
                    <Badge variant={p.role === 'viewer' ? 'neutral' : 'good'}>{ROLE_LABEL[p.role]}</Badge>
                  )}
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center" aria-hidden>
                    {active && <Check className="h-5 w-5 text-terra" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => {
            setOpen(false)
            router.push('/onboarding')
          }}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Add someone
        </Button>
      </Modal>
    </>
  )
}
