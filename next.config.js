/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF parse requires this for server-side usage
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

module.exports = nextConfig
