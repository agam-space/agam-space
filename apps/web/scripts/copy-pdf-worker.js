#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
/**
 * Copy PDF.js Worker
 *
 * react-pdf bundles its own pinned pdfjs-dist version (not necessarily
 * whatever version, if any, is a direct dependency of this app), and the
 * worker must exactly match the API version react-pdf resolves internally
 * or PDF preview fails at runtime with a version mismatch error. Resolving
 * pdfjs-dist starting from react-pdf's own package dir (rather than a
 * top-level require) guarantees we copy the worker react-pdf actually uses.
 *
 * Usage: node scripts/copy-pdf-worker.js
 */

const fs = require('fs');
const path = require('path');

function main() {
  const reactPdfDir = path.dirname(require.resolve('react-pdf/package.json'));
  const workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs', {
    paths: [reactPdfDir],
  });
  const workerDest = path.join(__dirname, '..', 'public', 'pdf.worker.mjs');

  fs.copyFileSync(workerSrc, workerDest);
  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json', { paths: [reactPdfDir] });
  console.log(
    `✅ Copied pdf.worker.min.mjs (pdfjs-dist@${require(pdfjsPkgPath).version}, resolved via react-pdf) to public/pdf.worker.mjs`
  );
}

main();
