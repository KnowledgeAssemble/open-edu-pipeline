import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';

export interface PackDocumentSource {
  documentId: string;
  title: string;
  file: string;
}

export interface KnowledgePackInput {
  outputDir: string; // e.g. output/nios-math-level-a/packs
  manifest: PackManifest; // zod-inferred, type 'knowledge'
  concepts: Concept[];
  sources: { documents: PackDocumentSource[] };
}

export interface CurriculumPackInput {
  outputDir: string; // e.g. output/nios-math-level-a/packs
  manifest: PackManifest; // zod-inferred, type 'curriculum'
  curriculum: Curriculum;
  sources: { documents: PackDocumentSource[] };
}

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
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
