import type { NextConfig } from 'next';
import { randomBytes } from 'crypto';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@agam-space/client', 'agam-space/core', 'agam-space/shared-types'],
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Handle node: protocol imports (libsodium-sumo uses node:fs in CJS build,
      // but its "browser" field only maps bare "fs" → false, not "node:fs")
      config.plugins.push(
        new (require('webpack').NormalModuleReplacementPlugin)(
          /^node:/,
          (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, '');
          }
        )
      );
    }
    return config;
  },
  generateBuildId: async () => {
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID;

    if (buildId) {
      console.log(`📦 Using NEXT_PUBLIC_BUILD_ID as Next.js buildId: ${buildId}`);
      return buildId;
    }

    const randomId = randomBytes(16).toString('hex').substring(0, 21);
    console.log(`📦 Generated random buildId (local dev): ${randomId}`);
    return randomId;
  },
};

export default nextConfig;
