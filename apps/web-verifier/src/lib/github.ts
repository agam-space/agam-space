import { IntegrityManifest } from '../types/manifest';

export async function fetchOfficialManifest(version: string): Promise<IntegrityManifest> {
  const manifestUrl = `/api/proxy/manifest/${version}`;

  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Release v${version} not found. This version may be before v0.2.7 when manifests were introduced.`
        );
      }
      throw new Error(`Failed to fetch manifest for version ${version} (HTTP ${response.status})`);
    }

    const manifest = await response.json();
    return manifest;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch manifest: ${error}`, { cause: error });
  }
}
