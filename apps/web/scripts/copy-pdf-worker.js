#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
/**
 * Copy PDF.js Worker
 *
 * pdfjs-dist's worker version must exactly match the API version react-pdf
 * loads, or PDF preview fails at runtime with a version mismatch error.
 * Copying it here (instead of committing a static file) keeps it in sync
 * automatically whenever pdfjs-dist is bumped.
 *
 * Usage: node scripts/copy-pdf-worker.js
 */

const fs = require('fs');
const path = require('path');

function main() {
  const workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
  const workerDest = path.join(__dirname, '..', 'public', 'pdf.worker.mjs');

  fs.copyFileSync(workerSrc, workerDest);
  console.log(
    `✅ Copied pdf.worker.min.mjs (pdfjs-dist@${require('pdfjs-dist/package.json').version}) to public/pdf.worker.mjs`
  );
}

main();
