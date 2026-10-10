import type { MetadataRoute } from 'next'

/**
 * Web app manifest (/manifest.webmanifest). Also the source of truth for the
 * Android TWA: `bubblewrap init --manifest https://<domain>/manifest.webmanifest`
 * reads name, colours, icons and shortcuts from here (twa/README.md).
 *
 * Screenshots: Play Console takes its own store screenshots; add
 * `screenshots` here only once real (synthetic-data) images exist in
 * public/screenshots, a missing file breaks the install prompt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CKD Tracker',
    short_name: 'CKD Tracker',
    description: 'Kidney health tracking and analytics for transplant patients',
    lang: 'en-IN',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F6F2',
    theme_color: '#F7F6F2',
    categories: ['medical', 'health'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Replace with a padded safe-zone variant (maskable.app) before the Play release.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Upload report',
        short_name: 'Upload',
        description: 'Add a lab report PDF or photo',
        url: '/upload',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Ask about your reports',
        url: '/chat',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Visits',
        short_name: 'Visits',
        description: 'Doctor visits and questions',
        url: '/visits',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
