'use client'

import { useEffect, useState } from 'react'
import { Check, Mail, Smartphone } from 'lucide-react'
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
  PROVIDER_GOOGLE,
  PROVIDER_PHONE,
  clearRecaptcha,
  confirmLinkPhone,
  friendlyAuthError,
  isUserCancelled,
  linkGoogle,
  startLinkPhone,
  unlinkProvider,
} from '@/lib/firebase/auth'
import { formatPhoneForDisplay, normalizeIndianPhone } from '@/lib/phone'

type PhoneStep = 'idle' | 'enter' | 'code'

/** Settings → Sign-in methods: list linked providers, link/unlink Google and phone. */
export function LinkedAccounts() {
  const { user, refreshUser } = useAuth()
  const [busy, setBusy] = useState<string | null>(null) // which action is running
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Phone-linking sub-flow
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('idle')
  const [phoneInput, setPhoneInput] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const resend = useCountdown(RESEND_SECONDS)

  useEffect(() => () => clearRecaptcha(), [])

  const providers = user?.providerData ?? []
  const google = providers.find((p) => p.providerId === PROVIDER_GOOGLE)
  const phoneProvider = providers.find((p) => p.providerId === PROVIDER_PHONE)
  const onlyOne = providers.length <= 1

  function reset() {
    setError('')
    setNotice('')
  }

  async function handleLinkGoogle() {
    reset()
    setBusy('link-google')
    try {
      const linked = await linkGoogle()
      if (linked) {
        await refreshUser()
        setNotice('Google is now linked. You can sign in with either method.')
      }
    } catch (err) {
      if (!isUserCancelled(err)) setError(friendlyAuthError(err, 'link-google'))
    } finally {
      setBusy(null)
    }
  }

  async function handleUnlink(providerId: string, label: string) {
    reset()
    if (!window.confirm(`Remove ${label} as a way to sign in?`)) return
    setBusy(`unlink-${providerId}`)
    try {
      await unlinkProvider(providerId)
      await refreshUser()
      setNotice(`${label} removed.`)
    } catch (err) {
      setError(friendlyAuthError(err, 'unlink'))
    } finally {
      setBusy(null)
    }
  }

  async function sendCode(target: string) {
    reset()
    setBusy('send-code')
    try {
      const id = await startLinkPhone(target, RECAPTCHA_CONTAINER_ID)
      setVerificationId(id)
      setPhone(target)
      setCode('')
      setPhoneStep('code')
      resend.restart()
    } catch (err) {
      setError(friendlyAuthError(err, 'link-phone'))
    } finally {
      setBusy(null)
    }
  }

  async function confirmCode(value: string) {
    if (!verificationId || value.length !== OTP_LENGTH || busy === 'confirm-code') return
    reset()
    setBusy('confirm-code')
    try {
      await confirmLinkPhone(verificationId, value)
      await refreshUser()
      cancelPhone()
      setNotice('Phone linked. You can now sign in with a one-time code.')
    } catch (err) {
      setError(friendlyAuthError(err, 'link-phone'))
      setCode('')
    } finally {
      setBusy(null)
    }
  }

  function cancelPhone() {
    clearRecaptcha()
    setPhoneStep('idle')
    setPhoneInput('')
    setVerificationId(null)
    setCode('')
    resend.reset()
  }

  useWebOtp(phoneStep === 'code', (otp) => {
    setCode(otp)
    void confirmCode(otp)
  })

  return (
    <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="signin-methods">
      <h3 id="signin-methods" className="label mb-1 text-ink-3">
        Sign-in methods
      </h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        If you used Google before, link your phone here — signing in with a new phone number first creates a
        separate empty account.
      </p>

      <ul className="divide-y divide-hair border-y border-hair">
        <MethodRow
          icon={<Smartphone className="h-4 w-4" aria-hidden />}
          title="Phone"
          detail={phoneProvider ? formatPhoneForDisplay(user?.phoneNumber ?? phoneProvider.phoneNumber) : 'Not linked'}
          linked={!!phoneProvider}
          action={
            phoneProvider ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={onlyOne || !!busy}
                loading={busy === `unlink-${PROVIDER_PHONE}`}
                onClick={() => handleUnlink(PROVIDER_PHONE, 'Phone')}
                title={onlyOne ? 'Link another method before removing this one' : undefined}
              >
                Unlink
              </Button>
            ) : phoneStep === 'idle' ? (
              <Button size="sm" variant="terra" disabled={!!busy} onClick={() => { reset(); setPhoneStep('enter') }}>
                Link
              </Button>
            ) : null
          }
        />

        {phoneStep !== 'idle' && !phoneProvider && (
          <li className="py-4">
            {phoneStep === 'enter' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const normalized = normalizeIndianPhone(phoneInput)
                  if (!normalized) {
                    setError('Enter a 10-digit Indian mobile number.')
                    return
                  }
                  void sendCode(normalized)
                }}
                noValidate
              >
                <label htmlFor="link-phone" className="label mb-2 block text-ink-3">
                  Mobile number
                </label>
                <PhoneField
                  id="link-phone"
                  value={phoneInput}
                  onChange={setPhoneInput}
                  disabled={busy === 'send-code'}
                  invalid={!!error}
                  autoFocus
                />
                <div className="mt-3 flex gap-2">
                  <Button type="submit" size="sm" loading={busy === 'send-code'}>
                    Send code
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelPhone}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void confirmCode(code)
                }}
                noValidate
              >
                <label htmlFor="link-otp" className="label mb-2 block text-ink-3">
                  Code sent to <span className="num normal-case tracking-normal">{formatPhoneForDisplay(phone)}</span>
                </label>
                <OtpField
                  id="link-otp"
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => void confirmCode(v)}
                  disabled={busy === 'confirm-code'}
                  invalid={!!error}
                  autoFocus
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" loading={busy === 'confirm-code'} disabled={code.length !== OTP_LENGTH}>
                    Verify &amp; link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelPhone}>
                    Cancel
                  </Button>
                  <span className="ml-auto text-[13px] text-ink-3" aria-live="polite">
                    {resend.left > 0 ? (
                      <>Resend in <span className="num">{resend.left}s</span></>
                    ) : (
                      <button type="button" className="tlink" disabled={!!busy} onClick={() => phone && void sendCode(phone)}>
                        Resend code
                      </button>
                    )}
                  </span>
                </div>
              </form>
            )}
          </li>
        )}

        <MethodRow
          icon={<Mail className="h-4 w-4" aria-hidden />}
          title="Google"
          detail={google ? google.email || user?.email || 'Linked' : 'Not linked'}
          linked={!!google}
          action={
            google ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={onlyOne || !!busy}
                loading={busy === `unlink-${PROVIDER_GOOGLE}`}
                onClick={() => handleUnlink(PROVIDER_GOOGLE, 'Google')}
                title={onlyOne ? 'Link another method before removing this one' : undefined}
              >
                Unlink
              </Button>
            ) : (
              <Button size="sm" variant="terra" disabled={!!busy} loading={busy === 'link-google'} onClick={handleLinkGoogle}>
                Link
              </Button>
            )
          }
        />
      </ul>

      {onlyOne && providers.length === 1 && (
        <p className="mt-3 text-[12px] text-ink-3">Your only sign-in method can’t be removed.</p>
      )}
      {error && <FormError>{error}</FormError>}
      {notice && (
        <p role="status" className="mt-3 rounded-btn bg-sage-pale px-3 py-2.5 text-sm text-ink">
          {notice}
        </p>
      )}

      {/* Invisible reCAPTCHA for phone linking; mounted once with this card. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </section>
  )
}

function MethodRow({
  icon,
  title,
  detail,
  linked,
  action,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  linked: boolean
  action: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-recess text-ink-2">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {title}
          {linked && <Check className="h-3.5 w-3.5 text-sage" aria-label="linked" />}
        </p>
        <p className="truncate text-[13px] text-ink-2">{detail}</p>
      </div>
      {action}
    </li>
  )
}
