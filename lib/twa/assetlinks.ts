/** Digital Asset Links statement list for a TWA (pure; see app/.well-known/assetlinks.json/route.ts). */
export interface AssetLink {
  relation: string[]
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] }
}

const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/** Normalise "aa:bb:…" / "AABB…" to colon-separated upper-case; null if not a SHA-256 fingerprint. */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, '')
  if (hex.length !== 64) return null
  const out = hex.match(/.{2}/g)!.join(':')
  return FINGERPRINT_RE.test(out) ? out : null
}

/** Empty list (valid JSON, no association) until both env vars are set. */
export function buildAssetLinks(packageName: string | undefined, fingerprints: string | undefined): AssetLink[] {
  const pkg = (packageName || '').trim()
  const prints = (fingerprints || '')
    .split(',')
    .map(normalizeFingerprint)
    .filter((f): f is string => !!f)
  if (!pkg || prints.length === 0) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints.filter((f, i) => prints.indexOf(f) === i) },
    },
  ]
}
