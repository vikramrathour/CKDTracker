import { NextResponse } from 'next/server'
import { buildAssetLinks } from '@/lib/twa/assetlinks'

export const dynamic = 'force-dynamic'

/**
 * GET /.well-known/assetlinks.json: Digital Asset Links for the Android TWA.
 * Without a matching entry Chrome shows the URL bar inside the app.
 * Configure ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINTS (comma-
 * separated; include both the upload key and the Play App Signing key).
 */
export function GET() {
  const body = buildAssetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_FINGERPRINTS)
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
