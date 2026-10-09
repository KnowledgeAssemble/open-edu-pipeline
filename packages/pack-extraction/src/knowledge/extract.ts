import type { SourceDocumentModel } from '../source-model/types.js';
import type { SourceManifest } from '../ingest/types.js';
import { slugify } from '../source-model/normalize.js';
import { parseGlossaryTerm } from './glossary.js';
import type {
  ConceptCandidate,
  GlossaryCandidate,
  KnowledgeModel,
  KnowledgeStatement,
} from './types.js';

const EXAMPLE_RE = /^[*_]{0,2}\s*Example\b\s*(\d+)?\s*:?\s*[*_]{0,2}\s*:?\s*(.+)$/i;

function parseExample(line: string): string | null {
  const match = EXAMPLE_RE.exec(line.trim());
  const example = match?.[2]?.trim();
  return example ? example : null;
}

export function extractKnowledge(
  doc: SourceDocumentModel,
  manifest: SourceManifest,
): KnowledgeModel {
  const concepts: ConceptCandidate[] = [];
  const glossary: GlossaryCandidate[] = [];
  const statements: KnowledgeStatement[] = [];
  const seenConceptIds = new Set<string>();
  const seenStatementIds = new Set<string>();

  for (const section of doc.sections) {
    for (const line of section.lines) {
      const parsed = parseGlossaryTerm(line);
      if (!parsed) continue;
      const id = slugify(parsed.term);
      if (seenConceptIds.has(id)) continue;
      seenConceptIds.add(id);
      concepts.push({
        id,
        title: parsed.term,
        summary: parsed.definition.slice(0, 2000),
        domainTags: ['mathematics'],
        source: { documentId: manifest.id, section: section.id },
        examples: [],
        misconceptions: [],
        prerequisites: [],
      });
      glossary.push({
        term: parsed.term,
        definition: parsed.definition,
        conceptId: id,
        source: { documentId: manifest.id, section: section.id },
      });
    }
  }

  const firstConcept = concepts[0];

  for (const section of doc.sections) {
    if (section.type === 'example' && firstConcept) {
      for (const line of section.lines) {
        const example = parseExample(line);
        if (example) firstConcept.examples.push(example);
      }
    }

    if (section.type === 'objective') {
      for (const line of section.lines) {
        if (!line.startsWith('*') && !line.startsWith('-')) continue;
        const statement = line.replace(/^[*+-]\s*/, '').trim();
        if (!statement) continue;
        statements.push({
          id: uniqueId(slugify(statement), seenStatementIds),
          conceptId: firstConcept?.id ?? '',
          statement,
          source: { documentId: manifest.id, section: section.id },
        });
      }
    }
  }

  for (const concept of concepts) {
    concept.examples = concept.examples.slice(0, 10);
    concept.misconceptions = concept.misconceptions.slice(0, 10);
    concept.prerequisites = concept.prerequisites.slice(0, 20);
  }

  return { documentId: manifest.id, concepts, statements, glossary };
}

function uniqueId(base: string, seen: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (id === '' || seen.has(id)) {
    id = base === '' ? `statement-${suffix}` : `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}
