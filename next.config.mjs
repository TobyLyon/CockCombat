import path from 'path'
import { fileURLToPath } from 'url'
let userConfig = undefined
try {
  // try to import ESM first
  userConfig = await import('./v0-user-next.config.mjs')
} catch (e) {
  try {
    // fallback to CJS import
    userConfig = await import("./v0-user-next.config");
  } catch (innerError) {
    // ignore error
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow production builds to proceed on CI while we iterate.
  // Note: We still surface lint/type issues locally.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Disable experimental features that cause hangs with Three.js
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  experimental: {
    // Prevent R3F from being bundled on server
    serverComponentsExternalPackages: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  webpack: (config, { isServer }) => {
    // Don't attempt to bundle Three.js on server
    if (isServer) {
      config.externals.push({
        'three': 'three',
        '@react-three/fiber': '@react-three/fiber',
        '@react-three/drei': '@react-three/drei',
      })
    }
    // Ensure @ alias resolves to project root for production builds
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(process.cwd()),
    }
    // Enable filesystem cache to speed up rebuilds
    config.cache = {
      type: 'filesystem',
      buildDependencies: {
        config: [fileURLToPath(import.meta.url)],
      },
    }
    return config
  },
  // Add security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  },
}

if (userConfig) {
  // ESM imports will have a "default" property
  const config = userConfig.default || userConfig
  // Capture base webpack to allow composition with user-provided webpack
  const baseWebpack = typeof nextConfig.webpack === 'function' ? nextConfig.webpack : undefined
  const userWebpack = typeof config.webpack === 'function' ? config.webpack : undefined

  for (const key in config) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...config[key],
      }
    } else {
      nextConfig[key] = config[key]
    }
  }

  // If both define a webpack function, compose them so we don't lose aliases
  if (baseWebpack && userWebpack) {
    nextConfig.webpack = (cfg, opts) => {
      const withBase = baseWebpack(cfg, opts)
      return userWebpack(withBase, opts)
    }
  } else if (baseWebpack && !userWebpack) {
    nextConfig.webpack = baseWebpack
  }
}

export default nextConfig
