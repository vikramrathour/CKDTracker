import { describe, expect, it } from 'vitest'
import { blockedMessage, planAccountDeletion } from '@/lib/server/account-deletion'
import { buildAssetLinks, normalizeFingerprint } from '@/lib/twa/assetlinks'

// Synthetic data only.

describe('planAccountDeletion', () => {
  it('deletes solo-owned profiles and leaves joined circles', () => {
    const plan = planAccountDeletion([
      { pid: 'u1', role: 'owner', displayName: 'Me', memberCount: 1 },
      { pid: 'u2_abcdef', role: 'editor', memberCount: 3 },
      { pid: 'u3_abcdef', role: 'viewer', memberCount: 2 },
    ])
    expect(plan).toEqual({ ok: true, leave: ['u2_abcdef', 'u3_abcdef'], deletePatients: ['u1'], blocked: [] })
  })

  it('refuses when an owned profile still has other members', () => {
    const plan = planAccountDeletion([
      { pid: 'u1', role: 'owner', displayName: 'Me', memberCount: 1 },
      { pid: 'u1_family1', role: 'owner', displayName: 'Dad Example', memberCount: 3 },
    ])
    expect(plan.ok).toBe(false)
    expect(plan.blocked).toEqual([{ pid: 'u1_family1', displayName: 'Dad Example', otherMembers: 2 }])
    expect(blockedMessage(plan)).toContain('Dad Example')
  })

  it('is fine with no memberships at all', () => {
    expect(planAccountDeletion([])).toEqual({ ok: true, leave: [], deletePatients: [], blocked: [] })
  })
})

describe('assetlinks', () => {
  const fp = 'AB'.repeat(32)

  it('normalises fingerprints', () => {
    expect(normalizeFingerprint(fp.toLowerCase())).toBe(fp.match(/.{2}/g)!.join(':'))
    expect(normalizeFingerprint('AB:CD')).toBeNull()
  })

  it('returns an empty list until configured', () => {
    expect(buildAssetLinks(undefined, fp)).toEqual([])
    expect(buildAssetLinks('com.example.ckd', '')).toEqual([])
  })

  it('builds a statement with de-duplicated fingerprints', () => {
    const other = 'CD'.repeat(32)
    const [link] = buildAssetLinks('com.example.ckd', `${fp}, ${other},${fp}, junk`)
    expect(link.target.package_name).toBe('com.example.ckd')
    expect(link.target.sha256_cert_fingerprints).toHaveLength(2)
    expect(link.relation).toEqual(['delegate_permission/common.handle_all_urls'])
  })
})
