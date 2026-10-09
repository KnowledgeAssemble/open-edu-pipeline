export interface KnowledgeStatement {
  id: string; // e.g. "fraction-part-of-whole"
  conceptId: string;
  statement: string;
  source: { documentId: string; section: string; page?: number };
}

export interface GlossaryCandidate {
  term: string;
  definition: string;
  conceptId: string;
  source: { documentId: string; section: string; page?: number };
}

export interface ConceptCandidate {
  id: string;
  title: string;
  summary: string;
  domainTags: string[];
  source: { documentId: string; section: string; page?: number };
  examples: string[]; // ≤ 10
  misconceptions: string[]; // ≤ 10
  prerequisites: string[]; // ≤ 20, same-pack ids
}

export interface KnowledgeModel {
  documentId: string;
  concepts: ConceptCandidate[];
  statements: KnowledgeStatement[];
  glossary: GlossaryCandidate[];
}
