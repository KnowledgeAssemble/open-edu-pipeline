export const ACTIVITY_STEPS = [
  'observe',
  'guided_practice',
  'independent_practice',
  'mastery_check',
  'positive_completion',
] as const;

export type ActivityStep = (typeof ACTIVITY_STEPS)[number];

export const COURSE_SPEC_TYPES = ['reading', 'exercise', 'quiz', 'reflection', 'widget'] as const;

export type CourseSpecActivityType = (typeof COURSE_SPEC_TYPES)[number];

export interface ExtractedPDF {
  metadata: {
    title: string;
    totalPages: number;
  };
  chapters: ChapterChunk[];
}

export interface ChapterChunk {
  chapterNumber: number;
  chapterTitle: string;
  sections: SectionChunk[];
  pages: number[];
}

export interface SectionChunk {
  heading: string;
  body: string;
  examples: string[];
  exercises: string[];
}

export interface ConceptCandidate {
  chapterNumber: number;
  chapterName: string;
  conceptId: string;
  learningObjective: string;
  coreIdea: string;
  examples: string[];
  misconceptions: string[];
  suggestedDependencies: string[];
  sourceSections: string[];
  supportingText: string;
  estimatedDuration: number;
}

export interface GeneratedConcept {
  conceptId: string;
  chapterCode: string;
  chapterName: string;
  learningObjective: string;
  coreIdea: string;
  examples: string[];
  misconceptions: string[];
  supports: { visual: boolean };
  masteryCriteria: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDuration: number;
  dependencies: string[];
}

export interface MCQQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ActivityContent {
  description: string;
  instructions?: string;
  examples?: string[];
  hints?: string[];
  questions?: MCQQuestion[];
  widgetConfig?: Record<string, unknown>;
}

export interface GeneratedActivity {
  step: ActivityStep;
  courseSpecType: CourseSpecActivityType;
  order: number;
  content: ActivityContent;
  widgetId?: string;
  widgetConfig?: Record<string, unknown>;
}

export interface ConceptActivityPair {
  concept: GeneratedConcept;
  activities: GeneratedActivity[];
}

export interface FailedConcept {
  concept: GeneratedConcept;
  errors: string[];
  retries: number;
}

export interface ConceptWarning {
  conceptId: string;
  warnings: string[];
}

export interface ActivityContext {
  sourceExcerpts: Array<{ id: string; type: string; text: string }>;
  assetManifestEntries: Array<{
    id: string;
    filename: string;
    altText: string;
    rendererType: string;
  }>;
  widgetCatalog: Array<{ id: string; name: string; description: string; capabilities: string[] }>;
  questionFamilies: string[];
  misconceptions: string[];
}

export type { CurriculumProfile, SourceTaxonomy } from './profile/types.js';

export interface ValidatedOutput {
  passed: ConceptActivityPair[];
  failed: FailedConcept[];
  warnings: ConceptWarning[];
}
