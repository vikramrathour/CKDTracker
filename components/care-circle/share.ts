/**
 * Pure helpers for sharing an invite link and describing roles. No React,
 * no Firebase (unit-tested in tests/invites.test.ts).
 */
import type { Role } from '@/lib/types/member'

export const ROLE_COPY: Record<Role, { label: string; short: string; long: string }> = {
  owner: {
    label: 'Owner',
    short: 'Manages the profile and the care circle',
    long: 'Created this profile. Can do everything, including inviting and removing people.',
  },
  editor: {
    label: 'Editor',
    short: 'Can see and add reports',
    long: 'Can see reports and chat, and also add or edit reports, medications, visits and notes.',
  },
  viewer: {
    label: 'Viewer',
    short: 'Can see reports',
    long: 'Can see reports and chat, but can’t add or change anything.',
  },
}

/** "a viewer" / "an editor" */
export function roleWithArticle(role: Role): string {
  return role === 'editor' || role === 'owner' ? `an ${role}` : `a ${role}`
}

/** The prefilled WhatsApp / share-sheet message. Names only; never medical details. */
export function buildInviteMessage(opts: { patientName: string; role: Role; url: string; inviteeName?: string | null }): string {
  const greeting = opts.inviteeName ? `Hi ${opts.inviteeName.split(/\s+/)[0]}, ` : ''
  const whose = opts.patientName ? `${opts.patientName}’s` : 'my'
  return (
    `${greeting}I’ve added you to ${whose} care circle on CKD Tracker as ${roleWithArticle(opts.role)}. ` +
    `Open this link and sign in with this phone number to join (valid for 7 days):\n${opts.url}`
  )
}

/**
 * wa.me deep link with the message prefilled. With the invitee's number the
 * chat with them opens directly; without it WhatsApp asks whom to send to.
 */
export function whatsappUrl(text: string, phoneE164?: string | null): string {
  const digits = (phoneE164 ?? '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
