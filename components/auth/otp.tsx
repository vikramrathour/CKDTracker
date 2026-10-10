'use client'

// Shared pieces of the phone-OTP flow, used by the login page and by
// Settings → Sign-in methods (linking a phone to an existing account).

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PHONE_COUNTRY_CODE } from '@/lib/phone'

/** Id of the invisible reCAPTCHA container. Each page that sends codes mounts it exactly once. */
export const RECAPTCHA_CONTAINER_ID = 'recaptcha-container'

export const OTP_LENGTH = 6
export const RESEND_SECONDS = 30

/** Pull a 6-digit code out of whatever was typed or pasted ("123 456", "Your code is 123456."). */
export function extractOtp(raw: string): string {
  const run = raw.match(/\d{6}/)
  if (run) return run[0]
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

/** Seconds-remaining countdown; `restart()` starts it again from `seconds`. */
export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return { left, restart: () => setLeft(seconds), reset: () => setLeft(0) }
}

/**
 * WebOTP API (Chrome on Android): resolves with the code from an incoming SMS
 * when the message ends with an origin-bound line ("@ckd.example #123456").
 * Firebase's default SMS template doesn't include that line, so in practice
 * `autocomplete="one-time-code"` is what fills the code; this is a bonus.
 */
export function useWebOtp(enabled: boolean, onCode: (code: string) => void) {
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('OTPCredential' in window)) return
    const ac = new AbortController()
    const options = { otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions
    navigator.credentials
      .get(options)
      .then((cred) => {
        const code = (cred as (Credential & { code?: string }) | null)?.code
        if (code) onCodeRef.current(extractOtp(code))
      })
      .catch(() => {
        // Aborted on unmount/step change, or the user dismissed the prompt.
      })
    return () => ac.abort()
  }, [enabled])
}

interface PhoneFieldProps {
  id: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  autoFocus?: boolean
}

/** National-number input with a fixed +91 prefix. */
export function PhoneField({ id, value, onChange, disabled, invalid, describedBy, autoFocus }: PhoneFieldProps) {
  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-btn border bg-vellum transition-[border-color,box-shadow] duration-200',
        'focus-within:border-terra focus-within:shadow-[0_0_0_3px_rgb(var(--terra)/.15)]',
        invalid ? 'border-critical' : 'border-hair-2 hover:border-hair-hot'
      )}
    >
      <span className="num flex select-none items-center border-r border-hair bg-recess px-3 text-[15px] font-semibold text-ink-2" aria-hidden>
        {PHONE_COUNTRY_CODE}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        enterKeyHint="send"
        placeholder="99999 00001"
        className="num min-w-0 flex-1 bg-transparent px-3 py-3 text-[17px] tracking-[.04em] text-ink outline-none placeholder:text-ink-3/60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
    </div>
  )
}

interface OtpFieldProps {
  id: string
  value: string
  onChange: (v: string) => void
  /** Called once when six digits are present (typed, pasted or autofilled). */
  onComplete?: (code: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  autoFocus?: boolean
}

/**
 * Single input (not six boxes) so SMS autofill, paste and screen readers all
 * just work. Spaced digits make it read like a code.
 */
export function OtpField({ id, value, onChange, onComplete, disabled, invalid, describedBy, autoFocus }: OtpFieldProps) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      enterKeyHint="done"
      pattern="\d{6}"
      // No maxLength: it would truncate a pasted "Your code is 123 456" before
      // extractOtp() can pull the digits out. onChange caps the value at 6 digits.
      placeholder="••••••"
      className={cn(
        'num w-full rounded-btn border bg-vellum px-4 py-3 text-center text-[26px] font-semibold tracking-[.5em] text-ink outline-none',
        'transition-[border-color,box-shadow] duration-200 placeholder:text-ink-3/50',
        'focus:border-terra focus:shadow-[0_0_0_3px_rgb(var(--terra)/.15)]',
        invalid ? 'border-critical' : 'border-hair-2 hover:border-hair-hot'
      )}
      value={value}
      onChange={(e) => {
        const code = extractOtp(e.target.value)
        onChange(code)
        if (code.length === OTP_LENGTH) onComplete?.(code)
      }}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
    />
  )
}

/** Inline error, matching the rest of the app. */
export function FormError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-3 rounded-btn bg-critical-pale px-3 py-2.5 text-sm text-critical">
      {children}
    </p>
  )
}
