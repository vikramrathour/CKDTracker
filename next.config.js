/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages that must not be bundled by webpack
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'firebase-admin'],
  },
}

module.exports = nextConfig
