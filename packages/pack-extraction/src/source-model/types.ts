export type SectionType =
  'objective' | 'content' | 'example' | 'exercise' | 'activity' | 'assessment' | 'note';

export interface SourceSection {
  id: string; // slugified heading, e.g. "learning-objectives"
  type: SectionType;
  title: string; // raw heading text, e.g. "Learning Objectives"
  headingLevel: number; // '#' count
  lines: string[]; // non-empty content lines under the heading
  sourcePages?: number[]; // optional; unused in slice
}

export interface SourceDocumentModel {
  document: { id: string; title: string };
  sections: SourceSection[];
}
