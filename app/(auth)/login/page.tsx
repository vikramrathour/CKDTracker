'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'

export default function LoginPage() {
  const { signIn, user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already signed in
  useEffect(() => {
    if (user) router.replace('/dashboard')
  }, [user, router])

  async function handleSignIn() {
    setLoading(true)
    setError('')
    try {
      await signIn()
      router.replace('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (user) return null

  return (
    <div className="animate-fade-up">
      <div className="relative mb-10 h-[52px] w-[68px]">
        <Image src="/icons/logo-mark.png" alt="" width={68} height={52} className="dark:hidden" priority />
        <Image src="/icons/logo-mark-light.png" alt="" width={68} height={52} className="hidden dark:block" priority />
      </div>

      <p className="eyebrow mb-4">CKD Tracker</p>
      <h1 className="font-serif text-[2.75rem] font-normal leading-[1.05] tracking-[-.025em] text-ink">
        Track your <em className="italic text-terra-dk">kidney</em> health
      </h1>
      <p className="mt-4 max-w-[30ch] font-serif text-lg italic leading-relaxed text-ink-2">
        Kidney health tracking for transplant patients
      </p>
      <hr className="my-9 h-0.5 w-9 border-0 bg-terra" />

      <Button
        onClick={handleSignIn}
        loading={loading}
        className="w-full"
        size="lg"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-white">
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        </span>
        Sign in with Google
      </Button>

      {error && (
        <p role="alert" className="mt-4 rounded-btn bg-critical-pale px-3 py-2.5 text-sm text-critical">{error}</p>
      )}

      <p className="mt-6 flex items-center gap-2 text-[13px] text-ink-3">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Your health data stays private and secure
      </p>
    </div>
  )
}
