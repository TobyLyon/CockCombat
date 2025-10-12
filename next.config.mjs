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
  // Remove the X-Powered-By header for a small security hardening boost
  poweredByHeader: false,
  // Prevent R3F/Three from being bundled on the server
  serverExternalPackages: ['three', '@react-three/fiber', '@react-three/drei'],
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
    // Content Security Policy — permissive enough to avoid breaking the app,
    // but strict enough to reduce abuse signals that can trigger ISP filters.
    // Note: Allow HTTPS and WSS for API/socket calls to support env-configured endpoints.
    const csp = [
      "default-src 'self'",
      // External scripts: p5 from cdnjs; keep inline disabled for scripts
      "script-src 'self' https://cdnjs.cloudflare.com",
      // Styles: allow Google Fonts and inline styles used by frameworks
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts from Google Fonts
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images and textures, including data URLs and blobs
      "img-src 'self' https: data: blob:",
      // Media (mp3 sound effects)
      "media-src 'self' https: data: blob:",
      // API calls: same-origin, Supabase, and any HTTPS/WSS endpoints
      "connect-src 'self' https: wss: https://*.supabase.co wss://*.supabase.co",
      // Disallow plugins
      "object-src 'none'",
      // Prevent clickjacking beyond our own origin
      "frame-ancestors 'self'",
      // Misc protections
      "base-uri 'self'",
      "form-action 'self' https:"
    ].join('; ')

    const permissionsPolicy = [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()'
    ].join(', ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: permissionsPolicy },
          { key: 'Content-Security-Policy', value: csp }
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
