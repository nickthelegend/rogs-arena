import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/shared'],
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'bluetooth=(self)' }],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
