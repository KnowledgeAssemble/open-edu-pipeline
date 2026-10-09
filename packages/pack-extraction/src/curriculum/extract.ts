import type { KnowledgeModel } from '../knowledge/types.js';
import type { SourceDocumentModel } from '../source-model/types.js';
import { slugify } from '../source-model/normalize.js';
import { CurriculumSchema } from '../schemas/index.js';
import type { LearningIntent } from '../schemas/index.js';

export interface CurriculumLikeness {
  title: string;
  subject: string;
  level?: string;
  units: Array<{
    id: string;
    title: string;
    concepts: string[];
    objectives: Array<{
      id: string;
      description: string;
      bloomLevel: 'understand';
      concepts: string[];
      requiresIntents: LearningIntent[];
    }>;
  }>;
}

export function extractCurriculum(
  knowledge: KnowledgeModel,
  doc: SourceDocumentModel,
): CurriculumLikeness {
  const conceptIds = knowledge.concepts.map((concept) => concept.id);
  const objectives = knowledge.statements.map((statement) => ({
    id: statement.id,
    description: statement.statement.slice(0, 500),
    bloomLevel: 'understand' as const,
    concepts: conceptIds,
    requiresIntents: ['understand'] as LearningIntent[],
  }));

  return {
    title: doc.document.title,
    subject: 'mathematics',
    level: 'A',
    units: [
      {
        id: slugify(doc.document.title),
        title: doc.document.title,
        concepts: conceptIds,
        objectives,
      },
    ],
  };
}

export function toCurriculum(
  likeness: CurriculumLikeness,
  refs: { knowledgePackId: string; curriculumPackId: string },
): CurriculumSchema {
  return CurriculumSchema.parse({
    id: refs.curriculumPackId,
    title: likeness.title,
    subject: likeness.subject,
    level: likeness.level,
    units: likeness.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      concepts: unit.concepts.map((concept) => ({ pack: refs.knowledgePackId, concept })),
      objectives: unit.objectives.map((objective) => ({
        id: objective.id,
        description: objective.description,
        bloomLevel: objective.bloomLevel,
        concepts: objective.concepts.map((concept) => ({
          pack: refs.knowledgePackId,
          concept,
        })),
        requiresIntents: objective.requiresIntents,
      })),
    })),
  });
}
