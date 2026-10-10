'use client'

import Image from 'next/image'
import { ArrowLeft, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePatient } from '@/components/providers/patient-provider'
import { PatientSwitcher } from './patient-switcher'

interface HeaderProps {
  title: string
  /** A word inside `title` to set in italic terra, the site's signature move. */
  emphasis?: string
  subtitle?: string
  showBack?: boolean
  actions?: React.ReactNode
}

function renderTitle(title: string, emphasis?: string) {
  if (!emphasis) return title
  const i = title.indexOf(emphasis)
  if (i === -1) return title
  return (
    <>
      {title.slice(0, i)}
      <em className="italic text-terra-dk">{emphasis}</em>
      {title.slice(i + emphasis.length)}
    </>
  )
}

export const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-btn text-ink-2 transition-colors duration-200 hover:bg-wash hover:text-ink'

/** Primary action in the header (e.g. upload, add): ink square. */
export const primaryIconButton =
  'flex h-11 w-11 items-center justify-center rounded-btn bg-ink text-canvas transition-[background-color,transform] duration-200 ease-editorial hover:bg-ink-hover hover:-translate-y-px'

export function Header({ title, emphasis, subtitle, showBack, actions }: HeaderProps) {
  const router = useRouter()
  const { patients, activePatient } = usePatient()
  // With more than one profile, always show whose data this is. Pages with a
  // back button are task screens (add/upload): name shown, but not switchable
  // mid-task.
  const multi = patients.length > 1 && activePatient != null

  return (
    <header className="glass sticky top-0 z-40 border-b border-hair pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {showBack ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className={`${iconButton} -ml-3`}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="relative block h-6 w-[31px] flex-shrink-0" aria-hidden>
              <Image src="/icons/logo-mark.png" alt="" width={31} height={24} className="dark:hidden" priority />
              <Image src="/icons/logo-mark-light.png" alt="" width={31} height={24} className="hidden dark:block" priority />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[22px] font-medium leading-tight tracking-[-.02em] text-ink">
              {renderTitle(title, emphasis)}
            </h1>
            {multi ? (
              <div className="flex min-w-0 items-center gap-1 text-xs leading-tight text-ink-3">
                {showBack ? (
                  <span className="truncate font-semibold text-terra-dk">For {activePatient.displayName}</span>
                ) : (
                  <PatientSwitcher className="min-w-0 flex-shrink" />
                )}
                {subtitle && <span className="truncate">· {subtitle}</span>}
              </div>
            ) : (
              subtitle && <p className="truncate text-xs leading-tight text-ink-3">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={() => router.push('/settings')}
            aria-label="Settings"
            className={`${iconButton} -mr-2`}
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
