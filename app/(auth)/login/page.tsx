'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import {
  FormError,
  OtpField,
  OTP_LENGTH,
  PhoneField,
  RECAPTCHA_CONTAINER_ID,
  RESEND_SECONDS,
  useCountdown,
  useWebOtp,
} from '@/components/auth/otp'
import {
  clearRecaptcha,
  friendlyAuthError,
  isUserCancelled,
  sendOtp,
  verifyOtp,
  type ConfirmationResult,
} from '@/lib/firebase/auth'
import { formatPhoneForDisplay, normalizeIndianPhone } from '@/lib/phone'

type Step = 'phone' | 'code'

export default function LoginPage() {
  const { signIn, user, redirectError, clearRedirectError } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<Step>('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [phone, setPhone] = useState<string | null>(null) // E.164 the code was sent to
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const resend = useCountdown(RESEND_SECONDS)
  const verifyingRef = useRef(false)

  // Redirect if already signed in
  useEffect(() => {
    if (user) router.replace('/dashboard')
  }, [user, router])

  // The reCAPTCHA container lives for the page's lifetime; tear the verifier down with it.
  useEffect(() => () => clearRecaptcha(), [])

  useEffect(() => {
    if (redirectError) setError(redirectError)
  }, [redirectError])

  async function requestCode(target: string) {
    setSending(true)
    setError('')
    clearRedirectError()
    try {
      const result = await sendOtp(target, RECAPTCHA_CONTAINER_ID)
      setConfirmation(result)
      setPhone(target)
      setCode('')
      setStep('code')
      resend.restart()
    } catch (err) {
      setError(friendlyAuthError(err, 'phone'))
    } finally {
      setSending(false)
    }
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeIndianPhone(phoneInput)
    if (!normalized) {
      setError('Enter a 10-digit Indian mobile number.')
      return
    }
    void requestCode(normalized)
  }

  const submitCode = useCallback(
    async (value: string) => {
      if (!confirmation || value.length !== OTP_LENGTH || verifyingRef.current) return
      verifyingRef.current = true
      setVerifying(true)
      setError('')
      try {
        await verifyOtp(confirmation, value)
        // onAuthStateChanged → user → redirect effect above.
      } catch (err) {
        setError(friendlyAuthError(err, 'phone'))
        setCode('')
      } finally {
        verifyingRef.current = false
        setVerifying(false)
      }
    },
    [confirmation]
  )

  useWebOtp(step === 'code', (otp) => {
    setCode(otp)
    void submitCode(otp)
  })

  function changeNumber() {
    clearRecaptcha()
    setStep('phone')
    setConfirmation(null)
    setCode('')
    setError('')
    resend.reset()
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setError('')
    clearRedirectError()
    try {
      await signIn()
      // Popup success → onAuthStateChanged redirects; redirect fallback navigates away.
    } catch (err) {
      if (!isUserCancelled(err)) setError(friendlyAuthError(err, 'google'))
    } finally {
      setGoogleLoading(false)
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

      {step === 'phone' ? (
        <form onSubmit={handlePhoneSubmit} noValidate>
          <label htmlFor="login-phone" className="label mb-2 block text-ink-3">
            Mobile number
          </label>
          <PhoneField
            id="login-phone"
            value={phoneInput}
            onChange={(v) => {
              setPhoneInput(v)
              if (error) setError('')
            }}
            disabled={sending}
            invalid={!!error}
            describedBy={error ? 'login-error' : 'login-phone-hint'}
          />
          <p id="login-phone-hint" className="mt-2 text-[13px] text-ink-3">
            We’ll text you a 6-digit code.
          </p>
          <Button type="submit" loading={sending} className="mt-5 w-full" size="lg">
            Send code
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submitCode(code)
          }}
          noValidate
        >
          <label htmlFor="login-otp" className="label mb-2 block text-ink-3">
            Enter the code
          </label>
          <p className="mb-3 text-sm text-ink-2">
            Sent to <span className="num font-semibold text-ink">{formatPhoneForDisplay(phone)}</span>
            <button type="button" onClick={changeNumber} className="tlink ml-2 text-sm">
              Change
            </button>
          </p>
          <OtpField
            id="login-otp"
            value={code}
            onChange={(v) => {
              setCode(v)
              if (error) setError('')
            }}
            onComplete={(v) => void submitCode(v)}
            disabled={verifying}
            invalid={!!error}
            describedBy={error ? 'login-error' : undefined}
            autoFocus
          />
          <Button
            type="submit"
            loading={verifying}
            disabled={code.length !== OTP_LENGTH}
            className="mt-5 w-full"
            size="lg"
          >
            Verify &amp; sign in
          </Button>
          <div className="mt-3 text-center text-sm text-ink-3" aria-live="polite">
            {resend.left > 0 ? (
              <span>
                Resend code in <span className="num">{resend.left}s</span>
              </span>
            ) : (
              <button
                type="button"
                className="tlink text-sm"
                disabled={sending}
                onClick={() => phone && void requestCode(phone)}
              >
                {sending ? 'Sending…' : 'Resend code'}
              </button>
            )}
          </div>
        </form>
      )}

      {error && <FormError id="login-error">{error}</FormError>}

      <div className="my-7 flex items-center gap-3 text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-hair" />
        <span className="label">or</span>
        <span className="h-px flex-1 bg-hair" />
      </div>

      <Button onClick={handleGoogle} loading={googleLoading} variant="secondary" className="w-full" size="lg">
        {!googleLoading && <GoogleMark />}
        Continue with Google
      </Button>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
        Used Google before? Continue with Google, then add your phone in Settings so both open the same account.
      </p>

      <p className="mt-8 flex items-start gap-2 text-[13px] text-ink-3">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        We never store passwords. Sign-in uses one-time codes.
      </p>

      <p className="mt-4 flex gap-4 text-[13px]">
        <a href="/privacy" className="tlink">Privacy policy</a>
        <a href="/terms" className="tlink">Terms</a>
      </p>

      {/* Invisible reCAPTCHA renders here; mounted once for the page's lifetime. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
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
  )
}
