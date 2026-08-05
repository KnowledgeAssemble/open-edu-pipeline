import { z } from 'zod';
import type { CurriculumProfile } from '../profile/types.js';

const widgetSchemaRegistry = new Map<string, z.ZodType>();

export function registerWidgetSchema(widgetId: string, schema: z.ZodType): void {
  widgetSchemaRegistry.set(widgetId, schema);
}

export function getWidgetSchema(widgetId: string): z.ZodType | undefined {
  return widgetSchemaRegistry.get(normalizeWidgetId(widgetId));
}

// Lightweight validation schemas matching widget config shapes.
// These are less strict than the runtime widget schemas (which live in .tsx files)
// but catch obvious issues like missing required fields.

const matchingSchema = z.object({
  description: z.string().nullable().optional(),
  pairs: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        itemA: z.string(),
        itemB: z.string(),
      }),
    )
    .min(1),
  hints: z.array(z.string()).nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const dragDropSchema = z.object({
  description: z.string().nullable().optional(),
  items: z
    .array(z.object({ id: z.string(), label: z.string(), emoji: z.string().nullable().optional() }))
    .min(1),
  targets: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  expectedPositions: z.record(z.string(), z.string()),
  hints: z.array(z.string()).nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const sequencingSchema = z.object({
  description: z.string().nullable().optional(),
  items: z
    .array(z.object({ id: z.string(), label: z.string(), emoji: z.string().nullable().optional() }))
    .min(1),
  correctOrder: z.array(z.string()).min(1),
  hints: z.array(z.string()).nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const storyQuestionSchema = z.object({
  scenario: z.string().nullable().optional(),
  story: z.string().nullable().optional(),
  // at least one of scenario or story must be present
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().min(0).max(3),
        explanation: z.string().nullable().optional(),
      }),
    )
    .min(1),
  visual: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const fillBlankSchema = z.object({
  description: z.string().nullable().optional(),
  template: z.string().nullable().optional(),
  statement: z.string().nullable().optional(),
  blanks: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        position: z.number().nullable().optional(),
        correctAnswer: z.union([z.string(), z.number()]),
        options: z
          .array(z.union([z.string(), z.number()]))
          .nullable()
          .optional(),
      }),
    )
    .nullable()
    .optional(),
  answers: z
    .array(z.union([z.string(), z.number()]))
    .nullable()
    .optional(),
  mode: z.enum(['select', 'type']).nullable().optional(),
  hints: z.array(z.string()).nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const visualCountingSchema = z.object({
  description: z.string().nullable().optional(),
  items: z.array(z.string()).nullable().optional(),
  count: z.number().nullable().optional(),
  text: z.string().nullable().optional(),
  emoji: z.string().nullable().optional(),
  left: z
    .union([z.array(z.string()), z.number()])
    .nullable()
    .optional(),
  right: z
    .union([z.array(z.string()), z.number()])
    .nullable()
    .optional(),
  sum: z.number().nullable().optional(),
  size: z.enum(['sm', 'md', 'lg']).nullable().optional(),
  hints: z.array(z.string()).nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const fractionVisualSchema = z.object({
  numerator: z.number().int().min(0),
  denominator: z.number().int().min(1),
  mode: z.enum(['bar', 'circle']).nullable().optional(),
  label: z.string().nullable().optional(),
  showLabel: z.boolean().nullable().optional(),
  compare: z
    .object({
      numerator: z.number().int().min(0),
      denominator: z.number().int().min(1),
    })
    .nullable()
    .optional(),
  size: z.number().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const chartReaderSchema = z.object({
  type: z.enum(['bar', 'pictograph']),
  data: z
    .array(
      z.object({ label: z.string(), value: z.number(), emoji: z.string().nullable().optional() }),
    )
    .min(1),
  title: z.string().nullable().optional(),
  showValues: z.boolean().nullable().optional(),
  correctLabel: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
});

const clockTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  mode: z.enum(['read', 'set']).nullable().optional(),
  showDigital: z.boolean().nullable().optional(),
  targetTime: z
    .object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) })
    .nullable()
    .optional(),
  size: z.number().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const measurementScaleSchema = z.object({
  type: z.enum(['ruler', 'thermometer', 'cylinder']),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().min(1),
  targetValue: z.number().nullable().optional(),
  showReading: z.boolean().nullable().optional(),
  showLabels: z.boolean().nullable().optional(),
  value: z.number().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
});

const placeValueChartSchema = z.object({
  description: z.string().nullable().optional(),
  maxPlaces: z.enum(['lakh', 'crore']),
  digits: z
    .array(z.union([z.number(), z.null()]))
    .nullable()
    .optional(),
  targetNumber: z.number().nullable().optional(),
  draggableDigits: z.array(z.number()).nullable().optional(),
  showLabels: z.boolean().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const gridAreaSchema = z.object({
  description: z.string().nullable().optional(),
  rows: z.number().int().min(1).max(20),
  cols: z.number().int().min(1).max(20),
  mode: z.enum(['area', 'perimeter']).nullable().optional(),
  highlighted: z
    .array(z.object({ row: z.number(), col: z.number() }))
    .nullable()
    .optional(),
  maxHighlights: z.number().int().min(1).nullable().optional(),
  cellSize: z.number().int().min(10).max(100).nullable().optional(),
  showCount: z.boolean().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const realWorldSchema = z.object({
  scenario: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  expectedAnswer: z.string().nullable().optional(),
  visualExample: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const multipleChoiceSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().min(0).max(3),
        explanation: z.string().nullable().optional(),
      }),
    )
    .min(1),
  interactive: z.boolean().nullable().optional(),
});

const audioPlayerSchema = z.object({
  audio: z.string().min(1),
  title: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  captions: z
    .array(z.object({ start: z.number(), end: z.number(), text: z.string() }))
    .nullable()
    .optional(),
  showTranscript: z.boolean().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  bookmarks: z.boolean().nullable().optional(),
});

const videoPlayerSchema = z.object({
  video: z.string().min(1),
  title: z.string().nullable().optional(),
  poster: z.string().nullable().optional(),
  chapters: z
    .array(z.object({ time: z.number(), title: z.string() }))
    .nullable()
    .optional(),
  transcript: z.string().nullable().optional(),
  showTranscript: z.boolean().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
});

const flashcardSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
        hint: z.string().nullable().optional(),
        image: z.string().nullable().optional(),
      }),
    )
    .min(1),
  mode: z.enum(['flip', 'multiple', 'spaced']).nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  shuffle: z.boolean().nullable().optional(),
});

const processDiagramSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable().optional(),
      }),
    )
    .min(2),
  connections: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(['arrow', 'dashed', 'double', 'loop']).nullable().optional(),
      }),
    )
    .min(1),
  layout: z.enum(['horizontal', 'vertical', 'cycle', 'radial']).nullable().optional(),
  title: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  stepByStep: z.boolean().nullable().optional(),
});

const numberLineSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  step: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  markers: z
    .array(z.object({ value: z.number(), label: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  showLabels: z.boolean().nullable().optional(),
  mode: z
    .enum(['integers', 'decimals', 'fractions', 'negative', 'measurement'])
    .nullable()
    .optional(),
  interactive: z.boolean().nullable().optional(),
});

const socialMapSchema = z.object({
  regions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .min(1),
  labels: z.boolean().nullable().optional(),
  legend: z
    .array(z.object({ color: z.string(), label: z.string() }))
    .nullable()
    .optional(),
  markers: z
    .array(z.object({ id: z.string(), label: z.string(), x: z.number(), y: z.number() }))
    .nullable()
    .optional(),
  title: z.string().nullable().optional(),
  interactive: z.boolean().nullable().optional(),
  targetRegion: z.string().nullable().optional(),
});

// Register all widget schemas
const WIDGET_SCHEMAS: Record<string, z.ZodType> = {
  'core.matching': matchingSchema,
  'core.drag-drop': dragDropSchema,
  'core.sequencing': sequencingSchema,
  'core.story-question': storyQuestionSchema,
  'core.fill-blank': fillBlankSchema,
  'core.visual-counting': visualCountingSchema,
  'math.fraction-visual': fractionVisualSchema,
  'core.chart-reader': chartReaderSchema,
  'math.clock-time': clockTimeSchema,
  'math.measurement-scale': measurementScaleSchema,
  'math.place-value-chart': placeValueChartSchema,
  'math.grid-area': gridAreaSchema,
  'core.real-world': realWorldSchema,
  'core.multiple-choice': multipleChoiceSchema,
  'core.multiple-choice-practice': multipleChoiceSchema,
  'core.audio-player': audioPlayerSchema,
  'core.video-player': videoPlayerSchema,
  'language.flashcard': flashcardSchema,
  'science.process-diagram': processDiagramSchema,
  'math.number-line': numberLineSchema,
  'social.map': socialMapSchema,
};

export function normalizeWidgetId(widgetId: string): string {
  return widgetId;
}

export function isKnownWidgetId(widgetId: string): boolean {
  return widgetSchemaRegistry.has(widgetId);
}

export function registerAllWidgetSchemas(): void {
  for (const [id, schema] of Object.entries(WIDGET_SCHEMAS)) {
    registerWidgetSchema(id, schema);
  }
}

registerAllWidgetSchemas();

export function getAllowedWidgetIdsForProfile(profile: CurriculumProfile): string[] {
  const allowed: string[] = [];
  for (const [id] of widgetSchemaRegistry) {
    const category = id.split('.')[0] || '';
    if (profile.widgetCategories.includes(category)) {
      allowed.push(id);
    }
  }
  return allowed;
}

export function getWidgetContextForProfile(
  profile: CurriculumProfile,
): { id: string; category: string }[] {
  return getAllowedWidgetIdsForProfile(profile).map((id) => ({
    id,
    category: id.split('.')[0] || '',
  }));
}

export function isWidgetAllowedForProfile(widgetId: string, profile: CurriculumProfile): boolean {
  const category = widgetId.split('.')[0] || '';
  return profile.widgetCategories.includes(category);
}
