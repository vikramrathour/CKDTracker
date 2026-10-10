'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeartHandshake, User } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { useAuth } from '@/components/providers/auth-provider'
import { usePatient } from '@/components/providers/patient-provider'
import { createPatient, setTarget } from '@/lib/firebase/patients'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { cn } from '@/lib/utils'
import type { PatientRelationship } from '@/lib/types/patient'

type Who = 'self' | 'other'

const TAC = REFERENCE_RANGES['Tacrolimus']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { patients, refreshPatients, setActivePatient } = usePatient()

  // pid == uid is your own profile; once it exists you can only add others.
  const hasOwnProfile = patients.some((p) => p.id === user?.uid)
  const isFirstProfile = patients.length === 0

  const [who, setWho] = useState<Who>(hasOwnProfile ? 'other' : 'self')
  const [name, setName] = useState(hasOwnProfile ? '' : user?.displayName ?? '')
  const [relationship, setRelationship] = useState<Exclude<PatientRelationship, 'self'>>('family')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [transplantDate, setTransplantDate] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [hospital, setHospital] = useState('')
  const [tacMin, setTacMin] = useState('')
  const [tacMax, setTacMax] = useState('')
  const [saving, setSaving] = useState<null | 'upload' | 'dashboard'>(null)
  const [error, setError] = useState<string | null>(null)

  const chooseWho = (next: Who) => {
    setWho(next)
    // Prefill your own name; clear it when switching to someone else.
    if (next === 'self' && !name) setName(user?.displayName ?? '')
    if (next === 'other' && name === (user?.displayName ?? '')) setName('')
  }

  function validate(): string | null {
    if (!name.trim()) return who === 'self' ? 'Please enter your name.' : 'Please enter their name.'
    const max = today()
    if (dateOfBirth && dateOfBirth > max) return 'Date of birth can’t be in the future.'
    if (transplantDate && transplantDate > max) return 'Transplant date can’t be in the future.'
    if (dateOfBirth && transplantDate && transplantDate < dateOfBirth) return 'Transplant date is before the date of birth.'
    if (tacMin || tacMax) {
      const lo = Number(tacMin)
      const hi = Number(tacMax)
      if (!tacMin || !tacMax || !isFinite(lo) || !isFinite(hi)) return 'Enter both tacrolimus target values, or leave both empty.'
      if (lo <= 0 || hi <= 0 || lo >= 40 || hi >= 40) return 'Tacrolimus targets are usually between 2 and 20 ng/mL.'
      if (lo >= hi) return 'The tacrolimus minimum must be below the maximum.'
    }
    return null
  }

  async function save(next: 'upload' | 'dashboard') {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(next)
    try {
      const pid = await createPatient(
        {
          displayName: name,
          relationship: who === 'self' ? 'self' : relationship,
          dateOfBirth: dateOfBirth || null,
          transplantDate: transplantDate || null,
          doctorName,
          hospital,
        },
        { self: who === 'self' }
      )
      if (tacMin && tacMax) {
        await setTarget(pid, 'Tacrolimus', {
          min: Number(tacMin),
          max: Number(tacMax),
          unit: TAC?.unit ?? 'ng/mL',
          ...(doctorName.trim() ? { setBy: doctorName.trim() } : {}),
        }).catch((err) => console.warn('Tacrolimus target not saved', err))
      }
      await refreshPatients()
      await setActivePatient(pid)
      router.replace(next === 'upload' ? '/upload' : '/dashboard')
    } catch (err) {
      console.error('Failed to create profile:', err)
      setError('Could not create the profile. Please try again.')
      setSaving(null)
    }
  }

  const whoOptions: { id: Who; title: string; body: string; icon: typeof User }[] = [
    { id: 'self', title: 'Myself', body: 'Track my own reports', icon: User },
    { id: 'other', title: 'Someone I care for', body: 'A parent, partner or child', icon: HeartHandshake },
  ]

  return (
    <>
      <Header title={isFirstProfile ? 'Welcome' : 'Add a profile'} emphasis={isFirstProfile ? undefined : 'profile'} showBack={!isFirstProfile} />
      <main className="px-4 pb-8 pt-6">
        <p className="eyebrow mb-3">{isFirstProfile ? 'Getting started' : 'Care circle'}</p>
        <h2 className="font-serif text-[2rem] font-normal leading-[1.1] tracking-[-.02em] text-ink">
          Whose health are we <em className="italic text-terra-dk">tracking</em>?
        </h2>
        <p className="mt-3 max-w-[38ch] text-[15px] text-ink-2">
          Each profile keeps its own reports, medications and doctor details. You can invite family to view or help later.
        </p>

        <form
          className="mt-7 space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save('upload')
          }}
          noValidate
        >
          {/* Who */}
          {!hasOwnProfile && (
            <div role="radiogroup" aria-label="Who is this profile for?" className="grid grid-cols-2 gap-2.5">
              {whoOptions.map((o) => {
                const Icon = o.icon
                const selected = who === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseWho(o.id)}
                    className={cn(
                      'flex min-h-[112px] flex-col items-start gap-2 rounded-card border bg-vellum p-3.5 text-left',
                      'transition-[border-color,box-shadow] duration-300 ease-editorial',
                      selected ? 'border-terra shadow-soft' : 'border-hair hover:border-hair-hot'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full',
                        selected ? 'bg-terra-pale text-terra-dk' : 'bg-recess text-ink-3'
                      )}
                      aria-hidden
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="font-serif text-lg font-medium leading-tight text-ink">{o.title}</span>
                    <span className="text-[13px] leading-snug text-ink-3">{o.body}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* About */}
          <section className="space-y-4 rounded-card border border-hair bg-vellum p-4">
            <h3 className="label text-ink-3">{who === 'self' ? 'About you' : 'About them'}</h3>
            <div>
              <label htmlFor="ob-name" className="mb-1.5 block text-xs font-medium text-ink-2">
                Name <span className="text-terra-dk">*</span>
              </label>
              <input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoComplete={who === 'self' ? 'name' : 'off'}
                required
                className="field"
              />
            </div>

            {who === 'other' && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-ink-2">Relationship</span>
                <div className="flex flex-wrap gap-2">
                  <Chip selected={relationship === 'family'} onClick={() => setRelationship('family')}>Family</Chip>
                  <Chip selected={relationship === 'other'} onClick={() => setRelationship('other')}>Someone else</Chip>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="ob-dob" className="mb-1.5 block text-xs font-medium text-ink-2">Date of birth</label>
                <input id="ob-dob" type="date" max={today()} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="field tabular" />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="ob-tx" className="mb-1.5 block text-xs font-medium text-ink-2">Transplant date</label>
                <input id="ob-tx" type="date" max={today()} value={transplantDate} onChange={(e) => setTransplantDate(e.target.value)} className="field tabular" />
              </div>
            </div>
          </section>

          {/* Care team */}
          <section className="space-y-4 rounded-card border border-hair bg-vellum p-4">
            <h3 className="label text-ink-3">Care team</h3>
            <div>
              <label htmlFor="ob-doctor" className="mb-1.5 block text-xs font-medium text-ink-2">Doctor</label>
              <input id="ob-doctor" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} maxLength={120} placeholder="e.g. Dr. A. Sharma" className="field" />
            </div>
            <div>
              <label htmlFor="ob-hospital" className="mb-1.5 block text-xs font-medium text-ink-2">Hospital</label>
              <input id="ob-hospital" value={hospital} onChange={(e) => setHospital(e.target.value)} maxLength={160} className="field" />
            </div>
            <fieldset>
              <legend className="mb-1.5 block text-xs font-medium text-ink-2">
                Tacrolimus target <span className="font-normal text-ink-3">(optional, ng/mL)</span>
              </legend>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Tacrolimus target minimum"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={tacMin}
                  onChange={(e) => setTacMin(e.target.value)}
                  placeholder={TAC ? String(TAC.min) : 'min'}
                  className="field tabular"
                />
                <span className="text-ink-3" aria-hidden>–</span>
                <input
                  aria-label="Tacrolimus target maximum"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={tacMax}
                  onChange={(e) => setTacMax(e.target.value)}
                  placeholder={TAC ? String(TAC.max) : 'max'}
                  className="field tabular"
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">The trough range your transplant team aims for. Leave empty to use the standard range.</p>
            </fieldset>
          </section>

          {error && (
            <p role="alert" className="rounded-card border border-l-2 border-hair border-l-critical bg-critical-pale p-3 text-sm text-critical">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Button type="submit" size="lg" loading={saving === 'upload'} disabled={saving !== null}>
              Save and upload a report
            </Button>
            <Button
              variant="secondary"
              size="lg"
              loading={saving === 'dashboard'}
              disabled={saving !== null}
              onClick={() => save('dashboard')}
            >
              Save and go to dashboard
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
