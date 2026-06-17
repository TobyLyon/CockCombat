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
  // The custom server (server.js) serves all /api routes directly, so no
  // external API proxy/rewrite is needed.

  images: {
    unoptimized: true,
  },
  // Reduce output artifact size to speed upload/deploy on Render
  outputFileTracingExcludes: {
    '*': [
      '**/*.map',
      '**/*.md',
      '**/test/**',
      '**/__tests__/**',
      '**/*.tsbuildinfo',
    ],
  },
  webpack: (config, { isServer, dev }) => {
    // R3F/Three are NOT externalized: externalizing them made the server
    // `require()` a second React module instance (CJS) separate from the
    // bundled one, which nulled React's hook dispatcher during SSR and crashed
    // every page ("Cannot read properties of null (reading 'useMemo')"). The 3D
    // components are loaded client-only (ssr:false), so Three is never rendered
    // on the server anyway.
    // Ensure @ alias resolves to project root for production builds
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(process.cwd()),
    }
    // Enable filesystem cache for faster rebuilds in both dev and prod
    if (dev) {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [fileURLToPath(import.meta.url)],
        },
      }
    } else {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [fileURLToPath(import.meta.url)],
        },
      }
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
