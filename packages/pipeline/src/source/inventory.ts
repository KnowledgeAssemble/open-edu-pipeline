import type { LlmRouter } from '@open-edu/pipeline-llm';
import type { SourceUnit, SourceInventory } from './types.js';
import { SourceInventorySchema, InventoryLLMResponseSchema } from './types.js';
import { buildInventoryPrompt } from './inventory-prompt.js';
import type { SourceTaxonomy } from '../profile/types.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TABLE_OF_CONTENTS = /^(?:Sl\.?\s*No\.?|Contents|TABLE\s*OF\s*CONTENTS)/im;

export interface PageContent {
  pageNum: number;
  text: string;
}

function splitIntoSegments(pages: PageContent[], taxonomy: SourceTaxonomy): SourceUnit[] {
  const units: SourceUnit[] = [];
  let exerciseMode = false;
  let unitCounter = 0;

  const lessonLabelPattern = taxonomy.lessonLabels.map(escapeRegex).join('|');
  const LESSON_HEADING = new RegExp(
    `^(?:${lessonLabelPattern})\\s+(\\d+)\\s*[:\\-\\u2013\\u2014]\\s*(.+)$`,
    'im',
  );

  const objectivePattern = taxonomy.objectiveLabels.map(escapeRegex).join('|');
  const OBJECTIVE_MARKER = new RegExp(`^(?:${objectivePattern})`, 'im');

  const examplePattern = taxonomy.exampleLabels.map(escapeRegex).join('|');
  const EXAMPLE_MARKER = new RegExp(
    `^(?:${examplePattern})\\s+(\\d+(?:\\.\\d+)?)\\s*[:\\-\\u2013\\u2014]`,
    'im',
  );

  const exercisePattern = taxonomy.exerciseLabels.map(escapeRegex).join('|');
  const EXERCISE_MARKER = new RegExp(`^(?:${exercisePattern})`, 'im');

  const reviewPattern = taxonomy.reviewLabels.map(escapeRegex).join('|');
  const REVIEW_MARKER = new RegExp(`^(?:${reviewPattern})`, 'im');

  const assessmentPattern = taxonomy.assessmentLabels.map(escapeRegex).join('|');
  const TEST_MARKER = new RegExp(`^(?:${assessmentPattern})`, 'im');

  for (const page of pages) {
    const segments = page.text.split(/\n{2,}/).filter((s) => s.trim().length > 0);

    for (const segment of segments) {
      unitCounter++;
      const id = `src-${unitCounter}`;
      const trimmed = segment.trim();
      const location = { pageStart: page.pageNum };

      if (TABLE_OF_CONTENTS.test(trimmed)) {
        units.push({
          id,
          type: 'unclassified',
          text: trimmed,
          location,
          extractionConfidence: 1.0,
          requiredCoverage: false,
        });
        continue;
      }

      if (LESSON_HEADING.test(trimmed)) {
        exerciseMode = false;
        units.push({
          id,
          type: 'lesson',
          text: trimmed,
          location,
          extractionConfidence: 1.0,
          requiredCoverage: true,
        });
        continue;
      }

      if (EXERCISE_MARKER.test(trimmed)) {
        exerciseMode = true;
        units.push({
          id,
          type: 'exercise',
          text: trimmed,
          location,
          extractionConfidence: 0.9,
          requiredCoverage: true,
        });
        continue;
      }

      if (OBJECTIVE_MARKER.test(trimmed)) {
        units.push({
          id,
          type: 'objective',
          text: trimmed,
          location,
          extractionConfidence: 0.95,
          requiredCoverage: true,
        });
        continue;
      }

      if (REVIEW_MARKER.test(trimmed)) {
        exerciseMode = false;
        units.push({
          id,
          type: 'review',
          text: trimmed,
          location,
          extractionConfidence: 0.9,
          requiredCoverage: false,
        });
        continue;
      }

      if (TEST_MARKER.test(trimmed)) {
        exerciseMode = false;
        units.push({
          id,
          type: 'assessment',
          text: trimmed,
          location,
          extractionConfidence: 0.9,
          requiredCoverage: true,
        });
        continue;
      }

      if (EXAMPLE_MARKER.test(trimmed)) {
        units.push({
          id,
          type: 'worked_example',
          text: trimmed,
          location,
          extractionConfidence: 0.9,
          requiredCoverage: true,
        });
        continue;
      }

      units.push({
        id,
        type: exerciseMode ? 'exercise' : 'unclassified',
        text: trimmed,
        location,
        extractionConfidence: exerciseMode ? 0.8 : 0.5,
        requiredCoverage: exerciseMode,
      });
    }
  }

  return units;
}

export async function buildSourceInventory(
  router: LlmRouter,
  pages: PageContent[],
  documentTitle: string,
  taxonomy?: SourceTaxonomy,
): Promise<SourceInventory> {
  const activeTaxonomy: SourceTaxonomy = taxonomy || {
    lessonLabels: ['Lesson', 'Chapter', 'Unit', 'Module'],
    sectionLabels: ['Section'],
    objectiveLabels: ['Learning Objectives', 'Objectives', 'Goals'],
    definitionLabels: ['Definition', 'Key Terms'],
    exampleLabels: ['Example'],
    exerciseLabels: ['Exercise', 'Practice', 'Questions'],
    reviewLabels: ['Review', 'Summary', 'Key Points'],
    assessmentLabels: ['Test', 'Assessment', 'Quiz'],
  };

  const rawUnits = splitIntoSegments(pages, activeTaxonomy);

  const unclassifiedUnits = rawUnits.filter((u) => u.type === 'unclassified');

  if (unclassifiedUnits.length > 0) {
    const promptInput = unclassifiedUnits.map((u) => ({
      id: u.id,
      pageStart: u.location.pageStart,
      heading: u.location.heading,
      text: u.text.slice(0, 1000),
    }));

    const prompt = buildInventoryPrompt(promptInput);
    try {
      const result = await router.generateStructuredRaw(
        'source_inventory',
        prompt,
        InventoryLLMResponseSchema,
        { temperature: 0.1 },
      );

      for (const classification of result.classifications) {
        const unit = unclassifiedUnits.find((u) => u.id === classification.unitId);
        if (unit) {
          unit.type = classification.type;
          unit.extractionConfidence = classification.extractionConfidence;
          unit.requiredCoverage = [
            'worked_example',
            'exercise',
            'assessment',
            'objective',
          ].includes(classification.type);
        }
      }
    } catch {
      // Keep unclassified on LLM failure
    }
  }

  const warnings: string[] = [];
  if (pages.length === 0) {
    warnings.push('No pages extracted from document');
  }

  const inventory: SourceInventory = {
    documentId: documentTitle.toLowerCase().replace(/\s+/g, '-'),
    title: documentTitle,
    totalPages: pages.length,
    units: rawUnits,
    warnings,
  };

  return SourceInventorySchema.parse(inventory);
}
