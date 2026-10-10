import { describe, expect, it } from 'vitest'
import {
  INVITE_TTL_MS,
  effectiveStatus,
  firstName,
  inviteExpiry,
  isExpired,
  isInviteRole,
  isValidInviteId,
  phoneHint,
  phonesMatch,
} from '@/lib/server/invites'
import { buildInviteMessage, roleWithArticle, whatsappUrl } from '@/components/care-circle/share'

// Synthetic numbers only (Firebase test-number range).
const A = '+919999900001'
const B = '+919999900002'

describe('phonesMatch', () => {
  it('matches the same E.164 number', () => {
    expect(phonesMatch(A, A)).toBe(true)
  })
  it('normalizes formatting on either side', () => {
    expect(phonesMatch('+91 99999 00001', A)).toBe(true)
    expect(phonesMatch(A, '99999-00001')).toBe(true)
  })
  it('rejects different numbers', () => {
    expect(phonesMatch(A, B)).toBe(false)
  })
  it('never matches a missing token phone (e.g. Google sign-in)', () => {
    expect(phonesMatch(null, A)).toBe(false)
    expect(phonesMatch(undefined, A)).toBe(false)
    expect(phonesMatch('', A)).toBe(false)
    expect(phonesMatch(A, null)).toBe(false)
  })
  it('does not match junk to junk', () => {
    expect(phonesMatch('abc', 'abc')).toBe(false)
  })
})

describe('expiry', () => {
  const now = new Date('2026-03-01T10:00:00Z')

  it('is 7 days out', () => {
    expect(inviteExpiry(now).getTime() - now.getTime()).toBe(INVITE_TTL_MS)
    expect(INVITE_TTL_MS).toBe(7 * 24 * 3600 * 1000)
  })
  it('is live until the instant it expires', () => {
    const exp = inviteExpiry(now)
    expect(isExpired(exp, new Date(exp.getTime() - 1))).toBe(false)
    expect(isExpired(exp, exp)).toBe(true)
    expect(isExpired(exp, new Date(exp.getTime() + 1))).toBe(true)
  })
  it('treats a missing expiry as expired', () => {
    expect(isExpired(null, now)).toBe(true)
  })
  it('reports pending-but-expired as expired and leaves other statuses alone', () => {
    const past = new Date(now.getTime() - 1)
    expect(effectiveStatus('pending', past, now)).toBe('expired')
    expect(effectiveStatus('pending', inviteExpiry(now), now)).toBe('pending')
    expect(effectiveStatus('accepted', past, now)).toBe('accepted')
    expect(effectiveStatus('revoked', past, now)).toBe('revoked')
  })
})

describe('role and id validation', () => {
  it('accepts only editor and viewer', () => {
    expect(isInviteRole('editor')).toBe(true)
    expect(isInviteRole('viewer')).toBe(true)
    expect(isInviteRole('owner')).toBe(false)
    expect(isInviteRole('admin')).toBe(false)
    expect(isInviteRole(undefined)).toBe(false)
  })
  it('accepts Firestore-style auto ids only', () => {
    expect(isValidInviteId('AbCdEfGhIjKlMnOpQrSt')).toBe(true)
    expect(isValidInviteId('../users/x')).toBe(false)
    expect(isValidInviteId('a/b')).toBe(false)
    expect(isValidInviteId('short')).toBe(false)
    expect(isValidInviteId(42)).toBe(false)
  })
})

describe('display helpers', () => {
  it('phoneHint reveals only the last two digits', () => {
    expect(phoneHint(A)).toBe('+91 ••••• •••01')
    expect(phoneHint(A)).not.toContain('99999')
    expect(phoneHint(null)).toBe('another number')
  })
  it('firstName takes the first word', () => {
    expect(firstName('  Test   Patient ')).toBe('Test')
    expect(firstName(undefined)).toBe('')
  })
  it('firstName never returns a phone number', () => {
    expect(firstName('+919999900001')).toBe('')
    expect(firstName('Member ••01')).toBe('Member ••01')
  })
  it('roleWithArticle', () => {
    expect(roleWithArticle('viewer')).toBe('a viewer')
    expect(roleWithArticle('editor')).toBe('an editor')
  })
})

describe('share message', () => {
  const url = 'https://example.test/invite/AbCdEfGhIjKlMnOpQrSt'

  it('includes the link, role and names, nothing else', () => {
    const text = buildInviteMessage({ patientName: 'Test Patient', role: 'viewer', url, inviteeName: 'Sam Example' })
    expect(text).toContain(url)
    expect(text).toContain('Hi Sam,')
    expect(text).toContain('Test Patient’s care circle')
    expect(text).toContain('a viewer')
  })
  it('builds a wa.me link to the invitee with the text encoded', () => {
    const link = whatsappUrl('Hi & welcome\n' + url, A)
    expect(link.startsWith('https://wa.me/919999900001?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hi & welcome\n' + url)
  })
  it('falls back to the contact picker link without a number', () => {
    expect(whatsappUrl('x')).toBe('https://wa.me/?text=x')
  })
})
