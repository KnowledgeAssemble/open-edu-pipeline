import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AssetManifest } from './types.js';
import { AssetManifestSchema, AssetManifestEntrySchema } from './types.js';
import { getRenderer } from './registry.js';

export function generateAssetFiles(
  manifest: AssetManifest,
  outputDir: string,
): { written: string[]; errors: string[] } {
  const assetsDir = join(outputDir, 'assets');
  const written: string[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const entry of manifest.assets) {
    if (ids.has(entry.id)) {
      errors.push(`Duplicate asset ID: "${entry.id}"`);
      continue;
    }
    ids.add(entry.id);

    const parseResult = AssetManifestEntrySchema.safeParse(entry);
    if (!parseResult.success) {
      errors.push(`Asset "${entry.id}" schema violation: ${parseResult.error.message}`);
      continue;
    }

    const filePath = join(assetsDir, entry.filename);
    if (!filePath.startsWith(assetsDir)) {
      errors.push(`Path traversal prevented: ${entry.filename}`);
      continue;
    }

    const renderer = getRenderer(entry.rendererType);
    if (!renderer) {
      errors.push(`Asset "${entry.id}" has unknown renderer type "${entry.rendererType}"`);
      continue;
    }

    try {
      const svgContent = renderer.render(entry);
      if (!existsSync(dirname(filePath))) {
        mkdirSync(dirname(filePath), { recursive: true });
      }
      writeFileSync(filePath, svgContent, 'utf-8');
      written.push(entry.filename);
    } catch (err: unknown) {
      errors.push(
        `Asset "${entry.id}" render failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const manifestPath = join(outputDir, 'assets', 'manifest.json');
  if (!existsSync(dirname(manifestPath))) {
    mkdirSync(dirname(manifestPath), { recursive: true });
  }
  writeFileSync(
    manifestPath,
    JSON.stringify(AssetManifestSchema.parse(manifest), null, 2),
    'utf-8',
  );
  return { written, errors };
}
