import { FileComparison, VerificationResult, VerificationStep } from '../types/manifest';
import { fetchOfficialManifest } from './github';
import { extractCommit, extractVersion, parseIntegrityHashes } from './parser';

/**
 * Compare semantic versions
 * Returns true if version1 < version2
 */
function isVersionBefore(version1: string, version2: string): boolean {
  const v1 = version1.replace(/^v/, '').split('.').map(Number);
  const v2 = version2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (v1[i] < v2[i]) return true;
    if (v1[i] > v2[i]) return false;
  }

  return false;
}

/**
 * Check if version is a valid release tag (e.g., v1.0.0, 1.0.0)
 * Rejects dev builds, commit hashes, or non-release versions
 */
function isValidReleaseVersion(version: string): boolean {
  // Check for common dev/non-release patterns
  const invalidPatterns = [
    /^dev/i, // dev, dev-abc123
    /^latest$/i, // latest
    /^main$/i, // main
    /^master$/i, // master
    /^canary/i, // canary
    /^alpha$/i, // alpha (without version)
    /^beta$/i, // beta (without version)
    /^rc$/i, // rc (without version)
    /^[0-9a-f]{7,40}$/i, // commit hash (7-40 hex chars)
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(version)) {
      return false;
    }
  }

  // Valid release version should be semantic versioning format
  // v1.0.0, v1.0.0-beta.1, v1.0.0-alpha.2, 1.0.0, etc.
  const semverPattern = /^v?\d+\.\d+\.\d+(-(?:alpha|beta|rc)\.\d+)?$/i;

  return semverPattern.test(version);
}

/**
 * Get user-friendly error message for invalid versions
 */
function getVersionErrorMessage(version: string): string {
  if (/^dev/i.test(version)) {
    return `This instance is running a development version (${version}). Development builds cannot be verified as they don't have official release integrity manifest.`;
  }

  if (/^[0-9a-f]{7,40}$/i.test(version)) {
    return `This instance is running a commit version (${version}). Only tagged releases can be verified.`;
  }

  if (/^(latest|main|master|canary)$/i.test(version)) {
    return `This instance is running "${version}" which is not a specific release version. Only tagged releases (e.g., v1.0.0) can be verified.`;
  }

  return `Invalid version format: "${version}". Only official release versions (e.g., v1.0.0) can be verified.`;
}

export async function verifyInstance(
  instanceUrl: string,
  version?: string
): Promise<VerificationResult> {
  const steps: VerificationStep[] = [];

  try {
    steps.push({
      name: 'Instance Connection',
      status: 'success',
      message: 'Connecting to instance...',
    });

    const html = await fetchInstanceHTML(instanceUrl);

    steps[0] = {
      name: 'Instance Connection',
      status: 'success',
      message: 'Successfully fetched instance HTML',
    };

    return await verifyFromHTML(html, instanceUrl, version, steps);
  } catch (error) {
    // If error has steps, throw it as-is for better error display
    if (error && typeof error === 'object' && 'steps' in error) {
      throw error;
    }

    // Handle fetch errors with structured steps
    if (error instanceof Error) {
      steps[0] = {
        name: 'Instance Connection',
        status: 'failed',
        message: 'Failed to connect to instance',
        details: error.message,
      };
      throw { steps, message: error.message };
    }

    throw new Error('Verification failed', { cause: error });
  }
}

/**
 * Verify an instance from manually provided HTML
 * Use this for instances behind authentication that can't be fetched via proxy
 */
export async function verifyInstanceManual(
  html: string,
  version?: string
): Promise<VerificationResult> {
  try {
    return await verifyFromHTML(html, 'manual-verification', version);
  } catch (error) {
    // If error has steps, throw it as-is for better error display
    if (error && typeof error === 'object' && 'steps' in error) {
      throw error;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Verification failed', { cause: error });
  }
}

/**
 * Core verification logic - used by both URL and manual modes
 */
async function verifyFromHTML(
  html: string,
  instanceUrl: string,
  version?: string,
  existingSteps: VerificationStep[] = []
): Promise<VerificationResult> {
  const steps: VerificationStep[] = [...existingSteps];

  // Step 1: Extract version from HTML if not provided
  const detectedVersion = version || extractVersion(html);
  if (!detectedVersion) {
    steps.push({
      name: 'Version Detection',
      status: 'failed',
      message: 'Could not detect version',
      details:
        'The instance HTML does not contain version metadata. Ensure the instance is running a proper Agam Space build.',
    });
    throw {
      steps,
      message:
        'Could not detect version from instance. The instance may not have version metadata.',
    };
  }
  steps.push({
    name: 'Version Detection',
    status: 'success',
    message: `Detected version: ${detectedVersion}`,
  });

  // Step 2: Validate that it's a release version (not dev/commit)
  if (!isValidReleaseVersion(detectedVersion)) {
    const errorMsg = getVersionErrorMessage(detectedVersion);
    steps.push({
      name: 'Release Version Check',
      status: 'failed',
      message: 'Not a release version',
      details: errorMsg,
    });
    throw { steps, message: errorMsg };
  }
  steps.push({
    name: 'Release Version Check',
    status: 'success',
    message: 'Valid release version format',
  });

  // Step 2.5: Check if version supports manifest (v0.2.7+)
  if (isVersionBefore(detectedVersion, '0.2.7')) {
    steps.push({
      name: 'Manifest Availability',
      status: 'failed',
      message: 'Version too old for verification',
      details: `Version ${detectedVersion} is before v0.2.7. Integrity verification is only available for v0.2.7 and later releases.`,
    });
    throw {
      steps,
      message: `This instance is running ${detectedVersion}, which is before v0.2.7. Integrity verification is only available for v0.2.7 and later.`,
    };
  }

  // Step 3: Extract commit
  const commit = extractCommit(html) || 'unknown';
  steps.push({
    name: 'Commit Detection',
    status: commit !== 'unknown' ? 'success' : 'warning',
    message:
      commit !== 'unknown' ? `Build commit: ${commit.substring(0, 7)}` : 'Commit hash not found',
  });

  // Step 4: Parse integrity hashes from HTML
  const instanceHashes = parseIntegrityHashes(html);
  if (Object.keys(instanceHashes).length === 0) {
    steps.push({
      name: 'Integrity Hashes',
      status: 'failed',
      message: 'No integrity hashes found',
      details:
        'The HTML does not contain any script or style tags with integrity attributes (SRI).',
    });
    throw { steps, message: 'No integrity hashes found in the instance HTML.' };
  }

  steps.push({
    name: 'Integrity Hashes',
    status: 'success',
    message: `Found ${Object.keys(instanceHashes).length} files with integrity hashes`,
  });

  // Step 5: Fetch official manifest
  let manifest;
  try {
    manifest = await fetchOfficialManifest(detectedVersion);
    steps.push({
      name: 'Official Manifest',
      status: 'success',
      message: `Downloaded manifest for ${detectedVersion}`,
    });
  } catch (error) {
    steps.push({
      name: 'Official Manifest',
      status: 'failed',
      message: 'Failed to fetch official manifest',
      details:
        error instanceof Error
          ? error.message
          : 'Could not download the official release integrity manifest from GitHub.',
    });
    throw {
      steps,
      message: error instanceof Error ? error.message : 'Failed to fetch official manifest',
    };
  }

  // Step 6: Verify HTML integrity (common for all verification modes)
  const pageInfo = extractPageInfo(html);
  steps.push({
    name: 'Page Detection',
    status: 'success',
    message: `HTML page: ${pageInfo.page}`,
  });

  // Determine which HTML file to verify against
  let expectedHtmlPath: string;
  if (instanceUrl === 'manual-verification') {
    // For manual verification, use the page from the HTML
    expectedHtmlPath = pageInfo.page === '/' ? '/index.html' : `${pageInfo.page}/index.html`;
  } else {
    // For URL-based verification, always expect root index.html
    expectedHtmlPath = '/index.html';
  }

  // Calculate hash of the actual HTML content
  const crypto = await import('crypto');
  const htmlHash = crypto.default.createHash('sha384').update(html).digest('base64');
  const htmlHashWithPrefix = `sha384-${htmlHash}`;

  const expectedHtmlHash = manifest.assets[expectedHtmlPath];

  // Always attempt HTML verification
  if (!expectedHtmlHash) {
    steps.push({
      name: 'HTML Verification',
      status: 'warning',
      message: `HTML file not found in manifest: ${expectedHtmlPath}`,
      details: 'The HTML file hash is not available in the official manifest.',
    });
  } else {
    const isHtmlAuthentic = htmlHashWithPrefix === expectedHtmlHash;

    if (isHtmlAuthentic) {
      steps.push({
        name: 'HTML Verification',
        status: 'success',
        message: `HTML matches official release (${expectedHtmlPath})`,
      });
    } else {
      // HTML verification failed - check for Cloudflare or show general warning
      const hasCloudflareMods = false; //html.includes('__CF$cv') || html.includes('cf-browser-verification') || html.includes('cdn-cgi/challenge-platform');

      if (hasCloudflareMods) {
        steps.push({
          name: 'HTML Verification',
          status: 'warning',
          message: 'Skipped (Cloudflare inline script detected)',
          details:
            'HTML verification is skipped because Cloudflare has injected inline scripts for security/bot protection. Only JS/CSS integrity is verified.',
        });
      } else {
        steps.push({
          name: 'HTML Verification',
          status: 'warning',
          message: 'HTML hash mismatch detected',
          details: `HTML content does not match the official release. This could be due to CDN modifications (like Cloudflare), custom scripts, or tampering. However, if the hash DID match, we would know the HTML is authentic and unmodified.`,
        });
      }
    }
  }

  // Step 7: Compare external resource hashes (JS/CSS)
  // Filter out HTML files from manifest since we're skipping HTML verification
  const manifestWithoutHtml = Object.fromEntries(
    Object.entries(manifest.assets).filter(([path]) => !path.endsWith('.html'))
  );

  const comparison = compareHashes(instanceHashes, manifestWithoutHtml);

  const isAuthentic = comparison.modifiedFiles.length === 0 && comparison.missingFiles.length === 0;

  if (isAuthentic) {
    steps.push({
      name: 'Hash Comparison',
      status: 'success',
      message: `All ${comparison.matchedFiles} files match official release`,
    });
  } else {
    const issues = [];
    if (comparison.modifiedFiles.length > 0) {
      issues.push(`${comparison.modifiedFiles.length} modified`);
    }
    if (comparison.missingFiles.length > 0) {
      issues.push(`${comparison.missingFiles.length} missing`);
    }
    steps.push({
      name: 'Hash Comparison',
      status: 'failed',
      message: `Files don't match: ${issues.join(', ')}`,
      details: 'Some files have been modified or are missing compared to the official release.',
    });
  }

  return {
    success: true,
    authentic: isAuthentic,
    instanceUrl,
    version: detectedVersion,
    commit,
    totalFiles: Object.keys(instanceHashes).length,
    matchedFiles: comparison.matchedFiles,
    modifiedFiles: comparison.modifiedFiles,
    missingFiles: comparison.missingFiles,
    extraFiles: comparison.extraFiles,
    details: comparison.details,
    steps,
  };
}

async function fetchInstanceHTML(instanceUrl: string): Promise<string> {
  const url = instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`;

  // Try 1: Direct fetch (faster, no proxy overhead)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch instance (HTTP ${response.status})`);
    }

    const html = await response.text();

    if (!html.toLowerCase().includes('<html') && !html.toLowerCase().includes('<!doctype')) {
      throw new Error('Response does not appear to be valid HTML');
    }

    return html;
  } catch (error) {
    const isCorsError =
      error instanceof TypeError &&
      (error.message.includes('fetch') ||
        error.message.includes('CORS') ||
        error.message.includes('Network'));

    if (isCorsError) {
      return await fetchInstanceHTMLViaProxy(url);
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to fetch instance', { cause: error });
  }
}

/**
 * Fetch instance HTML via API proxy (used as fallback when direct fetch fails due to CORS)
 */
async function fetchInstanceHTMLViaProxy(instanceUrl: string): Promise<string> {
  try {
    const proxyUrl = `/api/proxy/instance/?url=${encodeURIComponent(instanceUrl)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to fetch instance (HTTP ${response.status})`);
    }

    const html = await response.text();

    // Basic HTML validation
    if (!html.toLowerCase().includes('<html') && !html.toLowerCase().includes('<!doctype')) {
      throw new Error('Response does not appear to be valid HTML');
    }

    return html;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        'Cannot connect to instance. Possible reasons: (1) Instance is offline or unreachable, (2) Instance is behind authentication/VPN - try Manual HTML mode.',
        { cause: error }
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to fetch instance via proxy', { cause: error });
  }
}

function compareHashes(
  instanceHashes: Record<string, string>,
  officialHashes: Record<string, string>
) {
  const details: FileComparison[] = [];
  const modifiedFiles: string[] = [];
  const missingFromManifest: string[] = [];
  const extraFiles: string[] = [];
  let matchedFiles = 0;

  // Check ALL assets found in the HTML
  for (const [path, instanceHash] of Object.entries(instanceHashes)) {
    const officialHash = officialHashes[path];

    if (!officialHash) {
      // File found in HTML but not in official manifest
      extraFiles.push(path);
      details.push({ path, instanceHash, officialHash: null, status: 'extra' });
    } else if (instanceHash !== officialHash) {
      // File found in both but hashes don't match - MODIFIED
      modifiedFiles.push(path);
      details.push({ path, instanceHash, officialHash, status: 'modified' });
    } else {
      // File matches official hash
      matchedFiles++;
      details.push({ path, instanceHash, officialHash, status: 'match' });
    }
  }

  return { matchedFiles, modifiedFiles, missingFiles: missingFromManifest, extraFiles, details };
}

/**
 * Extract page information from Next.js HTML
 * @param html - The HTML content
 * @returns Object with page path and other metadata
 */
function extractPageInfo(html: string): { page: string; buildId: string } {
  try {
    // Look for Next.js data in script tag
    const nextDataMatch = html.match(/id="__NEXT_DATA__"[^>]*>([^<]+)</);
    if (!nextDataMatch) {
      return { page: '/', buildId: 'unknown' };
    }

    const nextData = JSON.parse(nextDataMatch[1]);
    return {
      page: nextData.page || '/',
      buildId: nextData.buildId || 'unknown',
    };
  } catch {
    return { page: '/', buildId: 'unknown' };
  }
}
