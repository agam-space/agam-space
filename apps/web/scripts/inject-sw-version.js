#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
/**
 * Inject Service Worker Cache Version
 *
 * Stamps the service worker's cache name with the current build ID so every
 * deploy gets a fresh cache, and stale caches from previous deploys are
 * purged on activate.
 *
 * Usage: node scripts/inject-sw-version.js <output-directory>
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/inject-sw-version.js <output-directory>');
    console.error('Example: node scripts/inject-sw-version.js apps/web/out');
    process.exit(1);
  }

  const outputDir = args[0];
  const swPath = path.join(outputDir, 'sw.js');

  if (!fs.existsSync(swPath)) {
    console.warn(`⚠️  No sw.js found at ${swPath}, skipping`);
    return;
  }

  const version = process.env.NEXT_PUBLIC_BUILD_ID || `dev-${Date.now()}`;
  const contents = fs.readFileSync(swPath, 'utf8');
  const updated = contents.replaceAll('__SW_VERSION__', version);

  fs.writeFileSync(swPath, updated, 'utf8');
  console.log(`✅ Stamped sw.js with cache version: ${version}`);
}

main();
