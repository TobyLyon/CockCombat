import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Resolve pino-pretty to our mock implementation using absolute path
    config.resolve.alias['pino-pretty'] = path.resolve(__dirname, './mocks/pino-pretty.js');
    
    return config;
  },
}

export default nextConfig;
