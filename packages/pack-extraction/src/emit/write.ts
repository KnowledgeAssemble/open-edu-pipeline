import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';

/** Mirrors @open-edu/packs SourceDocument; sources.json maps documentId → record. */
export interface PackSourceDocument {
  title: string;
  publisher?: string;
  year?: number;
  url?: string;
  license?: string;
}

export type PackSources = Record<string, PackSourceDocument>;

export interface KnowledgePackInput {
  outputDir: string; // e.g. output/nios-math-level-a/packs
  manifest: PackManifest; // zod-inferred, type 'knowledge'
  concepts: Concept[];
  sources: PackSources;
}

export interface CurriculumPackInput {
  outputDir: string; // e.g. output/nios-math-level-a/packs
  manifest: PackManifest; // zod-inferred, type 'curriculum'
  curriculum: Curriculum;
  sources: PackSources;
}

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

/** Wrap a single source document as a sources.json map keyed by its documentId. */
export function buildPackSources(
  documentId: string,
  title: string,
  extra: Omit<PackSourceDocument, 'title'> = {},
): PackSources {
  return { [documentId]: { title: title.slice(0, 256), ...extra } };
}

export function emitKnowledgePack(input: KnowledgePackInput): { paths: string[] } {
  const dir = join(input.outputDir, 'knowledge', input.manifest.id);
  const manifestPath = join(dir, 'manifest.json');
  const conceptsPath = join(dir, 'concepts.json');
  const sourcesPath = join(dir, 'sources.json');
  writeJson(manifestPath, input.manifest);
  writeJson(conceptsPath, input.concepts);
  writeJson(sourcesPath, input.sources);
  return { paths: [manifestPath, conceptsPath, sourcesPath] };
}

export function emitCurriculumPack(input: CurriculumPackInput): { paths: string[] } {
  const dir = join(input.outputDir, 'curriculum', input.manifest.id);
  const manifestPath = join(dir, 'manifest.json');
  const curriculumPath = join(dir, 'curriculum.json');
  const sourcesPath = join(dir, 'sources.json');
  writeJson(manifestPath, input.manifest);
  writeJson(curriculumPath, input.curriculum);
  writeJson(sourcesPath, input.sources);
  return { paths: [manifestPath, curriculumPath, sourcesPath] };
}
