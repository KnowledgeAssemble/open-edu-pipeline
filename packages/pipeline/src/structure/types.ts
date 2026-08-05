export interface ChapterStructure {
  id: string;
  label: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
  sections: SectionStructure[];
  confidence: number;
}

export interface SectionStructure {
  id: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
  parentChapterId: string;
  sourceUnitIds: string[];
  confidence: number;
}
