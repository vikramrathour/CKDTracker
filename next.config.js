/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages that must not be bundled by webpack
  serverExternalPackages: ['pdf-parse', 'firebase-admin'],
}

module.exports = nextConfig
