// Phone-number helpers for OTP sign-in. Pure functions, no Firebase.
//
// We use libphonenumber-js's "mobile" metadata: its isValid() only accepts
// numbers that can be mobiles, so Indian landlines (e.g. 011 2345 6789) are
// rejected without shipping the full "max" metadata.
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile'

/** SMS sign-in is restricted to India (matches the Firebase SMS region policy). */
export const PHONE_REGION = 'IN' as const
export const PHONE_COUNTRY_CODE = '+91'

// Digits plus the punctuation people actually type; anything else (letters,
// extensions, emoji) is rejected rather than silently ignored.
const ALLOWED = /^[\d\s()+.\-]+$/

/**
 * Normalize a user-entered Indian mobile number to E.164 (`+919999900001`).
 * Accepts `9999900001`, `+91 99999 00001`, `099999 00001`, `0091 99999 00001`,
 * `91 99999 00001`. Returns null for landlines, short/long numbers, non-Indian
 * numbers and junk.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || !ALLOWED.test(trimmed)) return null
  // A '+' is only meaningful as the very first character.
  if (trimmed.lastIndexOf('+') > 0) return null

  const parsed = parsePhoneNumberFromString(trimmed, PHONE_REGION)
  if (!parsed || parsed.country !== PHONE_REGION || !parsed.isValid()) return null
  return parsed.number
}

/**
 * Pretty-print an E.164 number for display: `+91 99999 00001`.
 * Falls back to the input when it can't be parsed (e.g. a non-Indian number
 * already linked to the account), and '' for empty input.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  const parsed = parsePhoneNumberFromString(e164, PHONE_REGION)
  if (!parsed) return e164
  if (parsed.country === PHONE_REGION && parsed.nationalNumber.length === 10) {
    const n = parsed.nationalNumber
    return `${PHONE_COUNTRY_CODE} ${n.slice(0, 5)} ${n.slice(5)}`
  }
  return parsed.formatInternational()
}

/**
 * True when a "name" is really a phone number, full or masked
 * ("+919999900001", "+91 99999 00001", "+91 ••••• •••01"). Older member and
 * activity docs stored the caller's number as their name.
 */
export function isPhoneLike(name: string | null | undefined): boolean {
  const s = (name ?? '').trim()
  return /^[+\d\s().\-•]+$/.test(s) && (s.match(/\d/g)?.length ?? 0) >= 2
}

/** "Member ••01" from a full or masked number; 'Someone' with no digits to show. */
export function memberLabel(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 2 ? `Member ••${digits.slice(-2)}` : 'Someone'
}

/**
 * The name to store or show for a person. A full phone number is never a
 * name: first real name of `fullName` (profile) → `displayName` (auth),
 * else "Member ••01" from the phone, else 'Someone'.
 */
export function pickPersonName(p: {
  fullName?: string | null
  displayName?: string | null
  phone?: string | null
}): string {
  for (const candidate of [p.fullName, p.displayName]) {
    const name = (candidate ?? '').trim().replace(/\s+/g, ' ')
    if (name && !isPhoneLike(name)) return name.slice(0, 100)
  }
  return memberLabel(p.phone)
}

/**
 * Render a stored person name. Legacy names that are just a phone number
 * become "Member ••01" so a full number is never shown as a name.
 */
export function formatPersonName(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return 'Someone'
  return isPhoneLike(s) ? memberLabel(s) : s
}

/**
 * Mask all but the last `keep` digits (default 4), e.g. for "code sent to
 * +91 ••••• •0001". Member docs store maskPhone(e164, 2): '+91 ••••• •••01'.
 */
export function maskPhone(e164: string | null | undefined, keep = 4): string {
  const display = formatPhoneForDisplay(e164)
  if (!display) return ''
  let toKeep = keep
  const chars = display.split('')
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!/\d/.test(chars[i])) continue
    if (toKeep > 0) toKeep--
    else if (i >= PHONE_COUNTRY_CODE.length) chars[i] = '•'
  }
  return chars.join('')
}
