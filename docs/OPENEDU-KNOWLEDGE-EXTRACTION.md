# OpenEdu Knowledge Extraction Pipeline

**Status:** Proposed (revised, reconciled with OPENEDU-PACK-SYSTEM.md v0.3)
**Version:** 0.2
**Owner:** KnowledgeAssemble / OpenEdu
**Purpose:** Transform educational source documents into source-grounded OpenEdu Knowledge Packs and Curriculum Packs.

---

# 0. What revision 0.2 changed

Version 0.1 was written before the Pack System spec (`/open-edu/docs/OPENEDU-PACK-SYSTEM.md`) reached v0.3. This revision reconciles the two so the pipeline's output is a valid Pack System input — **the Pack System is authoritative for pack shape; this document is authoritative for how packs are produced from sources.**

| Change | Reason |
| --- | --- |
| Pack layout (§29) now conforms to Pack System §7: `manifest.json`, `concepts.json`, `curriculum.json`, `sources.json` | 0.1's `examples.json`, `glossary.json`, `assessments/`, `sources/source-map.json` were rejected in Pack System §7.1 — examples, glossary, and prerequisites live inline on `ConceptSchema`; assessment is already `LearningIntent.Assess` + `QuestionSchema` |
| All IDs are kebab-case; `nios.math.level-a` → `nios-math-level-a` | Every manifest/ID regex in open-edu (`PackageManifestSchema`, `BundleManifestSchema`, `DistributionManifestSchema`, `CatalogPackageEntrySchema`, `RegistryMetadataSchema`) is `/^[a-z0-9][a-z0-9_-]*$/` — dots are rejected (Pack System §8.2) |
| Provenance fields renamed to `ConceptSourceSchema`: `documentId`, `locator?`, `section?`, `page?`, `excerpt?` | 0.1 used an ad-hoc `{document, section, page}`; `ConceptSourceSchema` (Pack System §9.2) is the contract `@open-edu/packs` validates against |
| Parser is pluggable; `@llamaindex/liteparse` is the default, LlamaParse an option | This repository already vendors liteparse (`src/extraction/`); the spec should not mandate a provider the repo does not use |
| Knowledge statements, glossary, examples, and assessment/activity evidence are **extraction-stage review artifacts**, not published pack files | Pack System §7.1 has no consumer for them as separate files; they feed validation and human review (§26–§28), then concepts absorb what survives |
| Repository proposal (§39) resolved: the pipeline lives in this repo (`open-edu-pipeline`), split into extraction and generation | Pack System §26.3: *"Ingestion lives in the standalone `open-edu-pipeline` repo… Packs are its output format"* |
| `PackManifestSchema` fields (`format`, `formatVersion`, `type`, `version`, `author`, `language`, `requires`, `derivedFrom: "document"`) specified at pack generation | Pack System §8.1 — an undeclared key in a pack is a validation error (`.strict()`) |
| Added §41.1 on the existing course-spec pipeline | This repo already ships an 8-stage PDF → course-spec pipeline; the spec must say how the two relate instead of pretending the repo is empty |
| Config example `language: "en-IN"` → `"en"` | `SUPPORTED_LOCALES = ['en','hi','or']` in `@open-edu/i18n`; `en-IN` is not a valid pack language |

### Post-revision refinements (same 0.2)

A review pass after the reconciliation exposed and fixed schema-shape drift between the Knowledge Model and the emitted packs:

| Fix | Where |
| --- | --- |
| Knowledge Model concept (`type`, `sources[]`) explicitly distinguished from pack `ConceptSchema` (`summary`, `domainTags`, single `source`) | §13, §15 |
| Single-source constraint stated: a pack concept records exactly one `ConceptSourceSchema` | §13 |
| Glossary gap acknowledged: `ConceptSchema` has no `term`/`definition` field; candidates stay in `review/` | §18, §29 |
| Relationships reconciled: only `prerequisite-of` reaches the pack; other types are extraction-internal | §19 |
| `sources.json` marked "proposed, pending Pack System schema" | §30 |
| `section` value convention settled (normalized id, not display label) | §6 |
| `Assessment Extraction` → `Evidence Extraction` in MVP flow | §36 |
| New package renamed `pack-extraction` to avoid collision with `pipeline/src/extraction/` | §39, §41.1 |
| ID-namespace hygiene note (`documentId` / knowledge pack / curriculum pack may share strings) | §20 |

---

# 1. Purpose

The OpenEdu Knowledge Extraction Pipeline converts source educational material into reusable, traceable educational context for OpenEdu Studio.

The first target is:

```text
NIOS PDF
    ↓
Parser (liteparse, default — LlamaParse optional)
    ↓
Source Markdown
    ↓
Source Model
    ↓
Knowledge Extraction
    ↓
Knowledge Pack
```

At the same time, curriculum information is extracted separately:

```text
Source Markdown
    ↓
Curriculum Extraction
    ↓
Curriculum Pack
```

The pipeline must preserve a clear distinction between:

1. **What the source document says**
2. **What OpenEdu derives from the source**
3. **What OpenEdu recommends pedagogically**

---

# 2. Core Principle

The pipeline MUST NOT be:

```text
PDF → LLM → finished course
```

Instead:

```text
SOURCE
  ↓
DOCUMENT NORMALIZATION
  ↓
SOURCE REPRESENTATION
  ↓
SOURCE UNDERSTANDING
  ↓
KNOWLEDGE / CURRICULUM EXTRACTION
  ↓
VALIDATION
  ↓
HUMAN REVIEW
  ↓
PACK
```

The resulting packs can then be consumed by OpenEdu Studio.

---

# 3. Architectural Model

```text
                         SOURCE
                           │
                 ┌─────────┴─────────┐
                 │                   │
              PDF/DOCX             HTML
                 │                   │
                 └─────────┬─────────┘
                           ▼
                     Document Ingestion
                            │
                            ▼
                  Parser (liteparse / LlamaParse)
                            │
                            ▼
                 Source Markdown + Metadata
                           │
                           ▼
                    Source Model
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        Knowledge      Curriculum     Assessment
        Extraction     Extraction     Extraction
             │             │             │
             ▼             ▼             ▼
       Knowledge Pack  Curriculum Pack  Evidence
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                    Validation / QA
                           │
                           ▼
                     Human Review
                           │
                           ▼
                    Published Packs
```

---

# 4. Source of Truth

The original source document remains the canonical source.

For a PDF:

```text
original.pdf
```

is retained.

Parser output (liteparse or otherwise) is a **derived source representation**, not the authoritative source.

Therefore:

```text
PDF
  = canonical source

Markdown
  = normalized processing representation

Knowledge Pack
  = extracted educational representation
```

Never discard the original source after parsing.

---

# 5. Why Markdown Is the Intermediate Representation

PDF is optimized for visual document presentation.

OpenEdu's extraction pipeline needs semantic structure.

Markdown provides a useful intermediate representation for:

* headings
* sections
* paragraphs
* lists
* tables
* exercises
* examples
* notes
* educational activities
* assessment sections

For example:

```markdown
# Lesson 5: Fractions

## Learning Objectives

...

## Introduction

...

## Let's Learn

...

## Example

...

## Exercise

...

## Let's Do and Learn

...
```

This structure is significantly easier for downstream extraction agents to reason about than raw PDF layout.

---

# 6. Provenance Must Survive Parsing

Markdown MUST retain enough provenance to trace content back to the source.

Conceptually:

```text
Markdown section
      ↓
source document
      ↓
page
      ↓
section
      ↓
source content
```

A generated knowledge item should therefore be traceable to something like:

```json
{
  "source": {
    "documentId": "nios-math-level-a",
    "section": "lesson-5",
    "page": 42
  }
}
```

The provenance schema is **not ours to invent**: it is `ConceptSourceSchema` from OPENEDU-PACK-SYSTEM §9.2 — `{ documentId, locator?, section?, page?, excerpt? }` — validated by `@open-edu/packs`.

**Value convention:** `section` carries the **normalized section id** (e.g. `"lesson-5"`), not the display label (e.g. `"Lesson 5: Fractions"`). Display labels, when needed, belong in `locator` or in the Source Model (§11) from which provenance was derived. `page` is the 1-based source PDF page. The invariant is:

> Every source-derived educational item must be traceable to its source.

---

# 7. Pipeline Stages

The MVP pipeline has eight stages.

```text
1. Ingest
2. Parse
3. Normalize
4. Understand
5. Extract
6. Enrich
7. Validate
8. Review / Publish
```

---

# 8. Stage 1 — Ingest

Input:

```text
PDF
DOCX
HTML
other supported source
```

For MVP, prioritize:

```text
PDF
```

Example:

```text
sources/
└── Math_Level_A_english_medium.pdf
```

Create a source manifest:

```json
{
  "id": "nios-math-level-a",
  "title": "Mathematics Level A",
  "format": "pdf",
  "filename": "Math_Level_A_english_medium.pdf"
}
```

The ingestion stage does not interpret educational meaning.

---

# 9. Stage 2 — Parse

Use a document parser to convert the document into structured Markdown. The parser is pluggable; only Stage 1–2 change when the parser changes (§42).

Default in this repository: `@llamaindex/liteparse` (already vendored in `packages/pipeline/src/extraction/`, provides the `lit` CLI on `PATH`; markdown extraction is in-process). LlamaParse is an optional substitute — the spec does not mandate a provider.

Conceptually:

```text
PDF
 ↓
Parser (liteparse default / LlamaParse optional)
 ↓
Markdown
```

Output:

```text
parsed/
└── nios-math-level-a.md
```

Where possible, retain:

* page boundaries
* headings
* tables
* lists
* document structure
* source metadata

The parser is responsible for **document structure**, not educational interpretation.

---

# 10. Stage 3 — Normalize

Parser output should be normalized before AI extraction.

Normalization may include:

* consistent heading hierarchy
* removing parser artifacts
* normalizing whitespace
* normalizing page markers
* normalizing lists
* preserving tables
* identifying obvious repeated headers/footers
* preserving section boundaries

Example:

```text
Raw parsed Markdown
        ↓
Normalized Markdown
```

Do not rewrite educational content during normalization.

Normalization should be as lossless as practical.

---

# 11. Stage 4 — Build Source Model

The normalized Markdown is converted into a structured Source Model.

This is the most important intermediate artifact.

Example:

```json
{
  "document": {
    "id": "nios-math-level-a",
    "title": "Mathematics Level A"
  },
  "sections": [
    {
      "id": "lesson-5",
      "type": "lesson",
      "title": "Fractions",
      "sourcePages": [40, 48],
      "objectives": [],
      "content": [],
      "examples": [],
      "exercises": [],
      "activities": []
    }
  ]
}
```

The Source Model represents:

> What is present in the source document.

It should not yet attempt to create an idealized educational ontology.

---

# 12. Source Model Categories

The initial Source Model should recognize a small set of structures.

```text
document
section
lesson
objective
content
example
exercise
activity
assessment
question
answer
table
note
definition
```

Do not create dozens of semantic types initially.

Add types only when real source material requires them.

---

# 13. Stage 5 — Knowledge Extraction

Knowledge extraction converts the Source Model into a Knowledge Model.

The extraction process identifies:

```text
Concepts
Knowledge statements
Definitions
Examples
Terminology
Relationships
Misconceptions where explicitly supported
Source references
```

Example (Knowledge Model concept — the *intermediate* shape, not the pack shape):

```json
{
  "id": "fraction",
  "title": "Fraction",
  "type": "concept",
  "sources": [
    {
      "documentId": "nios-math-level-a",
      "section": "lesson-5",
      "page": 42
    }
  ]
}
```

### Knowledge Model concept vs pack concept

The intermediate Knowledge Model and the emitted pack concept are **two different shapes**:

| | Knowledge Model (intermediate) | Pack `ConceptSchema` (emitted) |
| --- | --- | --- |
| `type` | present (`"concept"`) | **absent** — the manifest `type` carries it |
| `sources` | **array** — may list several | **`source`** — exactly one object |
| `summary` | absent (full statements live in Knowledge Statements) | **required**, ≤ 2000 chars |
| `domainTags` | absent | **required**, ≥ 1 entry (join key to activity registry) |
| `examples` / `misconceptions` / `prerequisites` | separate records (§17, §19) | inline arrays on the concept |

`emit/` (§39) performs this mapping. The important constraint:

> **A pack concept records exactly one `ConceptSourceSchema`.**

If extraction grounds one concept across several pages, it must either split the concept or designate a primary source and fold the rest into `locator`/`excerpt`. The Knowledge Model's `sources[]` is where the full set is held before that decision is made.

---

# 14. Knowledge Extraction Rule

The extractor must follow:

> Extract before interpreting.

It MUST NOT silently add outside knowledge.

For example, if the source discusses fractions but does not discuss a particular advanced concept, the extractor must not add it simply because the model knows it.

Bad:

```text
NIOS source
+
LLM general knowledge
=
Knowledge Pack
```

Correct:

```text
NIOS source
→ source-grounded Knowledge Pack
```

---

# 15. Concepts

Concepts represent identifiable educational ideas.

Example (Knowledge Model shape):

```json
{
  "id": "numerator",
  "title": "Numerator",
  "type": "concept"
}
```

The emitted pack concept additionally carries `summary`, `domainTags`, and inline `examples`/`misconceptions`/`prerequisites` — see the mapping table in §13.

Concept IDs should be stable and human-readable.

Prefer:

```text
fraction
numerator
denominator
addition
division
measurement
```

over generated opaque IDs.

---

# 16. Knowledge Statements

A concept is not itself an explanation.

Knowledge statements represent source-grounded information about the concept.

```json
{
  "id": "numerator-definition",
  "concept": "numerator",
  "statement": "...",
  "source": {
    "documentId": "nios-math-level-a",
    "section": "lesson-5",
    "page": 43
  }
}
```

This distinction allows Studio to use concepts for structure while AI uses knowledge statements for grounded generation.

---

# 17. Examples

Examples should remain separate from general knowledge.

```json
{
  "id": "fraction-example-01",
  "concepts": [
    "fraction"
  ],
  "content": "...",
  "source": {
    "documentId": "nios-math-level-a",
    "section": "lesson-5",
    "page": 44
  }
}
```

This enables future authoring requests such as:

> Give me examples from the source.

without requiring the AI to reconstruct them from memory.

---

# 18. Glossary

Terminology should be extracted into a lightweight glossary.

```json
{
  "term": "denominator",
  "definition": "...",
  "concept": "denominator",
  "source": {
    "documentId": "nios-math-level-a",
    "page": 43
  }
}
```

The glossary will later support:

* learner dictionary
* authoring assistance
* localization
* terminology consistency
* AI grounding

**Placement:** candidates land in `review/glossary-candidates.json`. There is no `glossary.json` in the pack — see the glossary gap note in §29. A term's definition only reaches the pack if it fits inside the concept's `summary` (≤ 2000 chars, Pack System §7.1/§9.2).

---

# 19. Relationships

Relationships should initially be conservative.

Possible relationship types:

```text
part-of
related-to
example-of
contrasts-with
prerequisite-of
```

Only create a relationship when supported by the source or explicitly marked as OpenEdu-derived.

Do not attempt to build a complete knowledge graph in version 0.2.

### Where relationships land

The pack has exactly **one** relationship field: `ConceptSchema.prerequisites` (same-pack concept IDs, acyclic — Pack System §9.3). There is no `relationships.json` (Pack System §7.1).

* **`prerequisite-of`** → maps to `ConceptSchema.prerequisites` at emit time (§39).
* **`part-of` / `related-to` / `example-of` / `contrasts-with`** → extraction-internal only. They are written to the Knowledge Model and kept in `review/` (§45) for validation and human inspection, but **not emitted into the pack**. If a later Studio feature needs them, that is a Pack System schema change, not something this pipeline invents unilaterally.

This is the same treatment as `origin` (§25): extraction may model more than the pack can carry, and the excess stays in the review stream.

---

# 20. Stage 5B — Curriculum Extraction

Curriculum extraction runs separately from knowledge extraction.

It identifies:

```text
units
lessons
learning objectives
sequence
assessment points
learning activities
expected outcomes
```

For NIOS Mathematics Level A, the source explicitly organizes material into lessons and assessment sections.

The curriculum extractor should preserve that structure.

Example (conforming to `CurriculumSchema`, Pack System §10.2 — kebab-case IDs, objectives required, lessons referenced by the curriculum's own structure rather than a foreign key):

```json
{
  "id": "nios-math-level-a",
  "title": "NIOS Mathematics Level A",
  "subject": "mathematics",
  "level": "A",
  "units": [
    {
      "id": "fractions",
      "title": "Fractions",
      "concepts": [
        { "pack": "nios-math-a-knowledge", "concept": "fraction" }
      ],
      "objectives": [
        {
          "id": "represent-fractions",
          "description": "Represent fractions",
          "concepts": [
            { "pack": "nios-math-a-knowledge", "concept": "fraction" }
          ],
          "requiresIntents": ["understand", "practice"]
        }
      ]
    }
  ]
}
```

`requiresIntents` uses the existing `LearningIntent` enum (Pack System §10.2) — curriculum extraction may not invent capability vocabularies.

**ID hygiene across the three id spaces:** `documentId` (`nios-math-level-a`), the knowledge pack id (`nios-math-a-knowledge`), and the curriculum pack id also happen to be `nios-math-level-a` in this example. They may collide because they live in different namespaces (source document vs `@open-edu/packs`), but `emit/` must not rely on the strings differing — always qualify: concept refs as `{pack, concept}` (Pack System §10.2), provenance by `documentId`. Prefer distinct suffixes (e.g. `nios-math-a-source` for the document) where it costs nothing.

---

# 21. Knowledge vs Curriculum Boundary

The same source material may contain both.

Do not duplicate it unnecessarily.

For example:

```text
"Fractions"
```

may exist as:

### Knowledge

```text
Concept:
fraction
```

and:

### Curriculum

```text
Unit:
Fractions

Objective:
represent fractions
```

These should reference each other.

```text
Curriculum Objective
        ↓
Knowledge Concept
```

---

# 22. Stage 5C — Assessment Extraction

Assessment questions should be extracted separately from general knowledge.

For example:

```json
{
  "id": "assessment-question-01",
  "type": "question",
  "content": "...",
  "concepts": [
    "division"
  ],
  "source": {
    "documentId": "nios-math-level-a",
    "section": "assessment",
    "page": 78
  }
}
```

The NIOS material contains exercises, word problems, answers, and assessment material, making these useful evidence sources rather than merely text to store.

These land in the working directory's `review/` stream (§45), **not** in the pack: Pack System §5 has no Assessment Pack — assessment is `LearningIntent.Assess` + `QuestionSchema` on the course side. Evidence that survives review informs curriculum `requiresIntents` and Studio generation.

---

# 23. Stage 5D — Activity Evidence Extraction

Practical activities should also be identified.

For example, the EVS material contains "Let's do and learn" activities that connect lesson material to real-world observation and action.

Represent these as source evidence:

```json
{
  "id": "food-observation-01",
  "type": "source-activity",
  "title": "...",
  "concepts": [
    "food"
  ],
  "source": {
    "documentId": "nios-evs-level-a",
    "section": "lesson-...",
    "page": 52
  }
}
```

Do not immediately convert every source activity into an OpenEdu executable activity.

Like assessment evidence, source activities are `review/` artifacts (§45) — capabilities and widget choices belong to the activity registry, never to a pack (Pack System §3.2, §12.2).

---

# 24. Stage 6 — OpenEdu Pedagogical Enrichment

This is deliberately separated from extraction.

Once source-grounded knowledge exists, OpenEdu can derive additional metadata.

For example:

```json
{
  "concept": "fraction",
  "learningAffordances": [
    "represent",
    "identify",
    "compare"
  ]
}
```

Or:

```json
{
  "concept": "fraction",
  "suggestedCapabilities": [
    "visual-representation",
    "matching",
    "practice"
  ]
}
```

These are **OpenEdu recommendations**, not claims about what the NIOS document says.

Enrichment output is persisted alongside the review artifacts (§45), never merged into a pack whose manifest declares `derivedFrom: "document"` — see §25.

---

# 25. Provenance Levels

Every item should have an origin classification.

Recommended:

```text
source
derived
enriched
```

### source

Directly extracted or faithfully structured from the source.

### derived

Reasonably inferred from source structure.

### enriched

Added by OpenEdu for pedagogical or technical purposes.

Example:

```json
{
  "id": "fraction",
  "origin": "source"
}
```

versus:

```json
{
  "id": "fraction-visual-representation",
  "origin": "enriched"
}
```

This distinction should remain visible internally.

**But `origin` is extraction-internal, not pack data.** `ConceptSchema` is `.strict()` (Pack System §9.2) and declares no `origin` field — writing one would be a validation error. Consequences:

* `origin: "source"` / `"derived"` travels inside each concept's `ConceptSourceSchema` (the provenance contract the pack actually carries).
* `origin: "enriched"` items (§24) are **filtered out** of a `derivedFrom: "document"` pack — pedagogical enrichment does not belong in a pack that claims document derivation. Enrichment is persisted in the working directory's `review/` stream (§45) and applied later by Studio/the Pack System's authoring context (Pack System §20.1).

---

# 26. Stage 7 — Validation

Validation occurs before a pack becomes publishable.

## Structural validation

Check:

```text
✓ PackManifestSchema (format, formatVersion, kebab-case id, exact semver)
✓ ConceptSchema / CurriculumSchema, both .strict()
✓ required fields
✓ unique IDs
✓ valid references (prerequisite cycles rejected)
✓ derivedFrom: "document" set → ConceptSourceSchema present on every concept
```

## Source validation

Check:

```text
✓ every source item has provenance
✓ source page/section exists
✓ extracted content can be traced
```

## Curriculum validation

Check:

```text
✓ objectives reference valid concepts
✓ lesson references resolve
✓ assessment references resolve
```

## Activity validation

Check:

```text
✓ suggested capability exists
✓ no nonexistent executable activity is referenced
```

---

# 27. Source Fidelity Validation

The pipeline should include an LLM-assisted source-fidelity check.

Input:

```text
Source section
+
Extracted knowledge
```

Ask:

> Is every factual claim in the extracted knowledge supported by the source section?

Output:

```json
{
  "status": "pass",
  "unsupportedClaims": []
}
```

or:

```json
{
  "status": "review",
  "unsupportedClaims": [
    "..."
  ]
}
```

This is a review mechanism, not an authority.

---

# 28. Human Review Gate

No pack should automatically become an authoritative curriculum pack simply because an LLM generated it.

Recommended workflow:

```text
Generated Pack
      ↓
Automated Validation
      ↓
Source Fidelity Review
      ↓
Human Review
      ↓
Approved Pack
```

The reviewer should be able to inspect:

```text
Concept
 ↓
Knowledge statement
 ↓
Source page
 ↓
Original source
```

---

# 29. Pack Generation

Once approved, the Knowledge Model and Curriculum Model are emitted as **two packs** conforming to OPENEDU-PACK-SYSTEM §7 — the Pack System is authoritative for pack shape:

```text
Knowledge Model          Curriculum Model
      ↓                        ↓
Knowledge Pack           Curriculum Pack
```

Example:

```text
packs/
  knowledge/
    nios-math-a-knowledge/
      ├── manifest.json        # PackManifestSchema (§8.1 of Pack System)
      ├── concepts.json        # ConceptSchema[] — examples, glossary terms,
      │                        #   misconceptions, prerequisites inline (§9.2)
      └── sources.json         # optional: additional document evidence
  curriculum/
    nios-math-level-a/
      ├── manifest.json
      ├── curriculum.json      # CurriculumSchema (§10.2)
      └── sources.json         # optional
```

`manifest.json` fields are exactly `PackManifestSchema` (Pack System §8.1):

```json
{
  "format": "openedu-pack",
  "formatVersion": 1,
  "type": "knowledge",
  "id": "nios-math-a-knowledge",
  "version": "0.1.0",
  "name": "NIOS Mathematics Level A — Knowledge",
  "author": "KnowledgeAssemble",
  "language": "en",
  "derivedFrom": "document"
}
```

Notes:

* **kebab-case IDs, exact semver** — shared identifier space with course/package IDs (Pack System §8.2–§8.3).
* **`derivedFrom: "document"`** is what makes per-concept `source` mandatory at validation (Pack System §20.1). Document-derived packs MUST set it.
* **No `examples.json`, `glossary.json`, `assessments/`, or `source-map.json` inside the pack** — 0.1's layout violated Pack System §7.1. Examples and misconceptions ride inline on `ConceptSchema.examples`/`misconceptions`; prerequisite edges ride on `ConceptSchema.prerequisites`; assessment questions are evidence for review and, if they survive, live in the curriculum/course side as `QuestionSchema` — not in the pack.
* **Glossary is a known cross-spec gap.** Pack System §7.1 says "concepts carry glossary terms inline", but `ConceptSchema` (§9.2) has **no `term`/`definition` field** — only `summary` (≤ 2000 chars) and `examples[]`. Until the schema changes, glossary candidates extracted in §18 stay in `review/glossary-candidates.json`; the emit/ stage folds a term's definition into the concept's `summary` only when it fits. This is raised as an open question against the Pack System rather than worked around silently.
* **Intermediate extraction artifacts stay outside the pack.** Knowledge statements, glossary candidates, assessment evidence, and activity evidence are written to the pipeline's working/output directory (§45) for validation (§26) and human review (§28). They are the audit trail; the pack is the product.

Keep the initial pack small.

---

# 30. Source Map

Provenance has two homes, both defined by the Pack System:

1. **On each concept** — `ConceptSourceSchema` (`{documentId, locator?, section?, page?, excerpt?}`), required when the manifest declares `derivedFrom: "document"`.
2. **`sources.json`** — optional per-pack file for evidence that attaches to the pack as a whole (source document identity, parse metadata, coverage ranges).

> **Canonical shape.** `sources.json` maps each `documentId` to a human-readable
> record (`title` required; `publisher`, `year`, `url`, `license` optional), matching
> `SourceDocumentSchema` in `@open-edu/packs`. It is **not** a `{ "documents": [...] }`
> wrapper — the dev-server rejects that with `KNOWLEDGE_SOURCE_MISSING`.

Example (`sources.json`):

```json
{
  "nios-math-level-a": {
    "title": "Mathematics Level A",
    "publisher": "NIOS",
    "year": 2023,
    "license": "CC-BY"
  }
}
```

An item with no resolvable source, when `derivedFrom: "document"` is declared, is a **validation error**, not a warning (Pack System §3.5). This provides the mechanism for Studio to expose provenance.

---

# 31. Derived Search / RAG Index

Embeddings should be a **derived artifact**, not part of the canonical pack.

```text
Knowledge Pack
      │
      ├── Studio browsing
      │
      ├── Search index
      │
      └── RAG index
```

The pack remains portable.

The same pack can therefore be used with:

```text
local search
Supabase
pgvector
browser search
different AI providers
```

without changing its canonical representation.

---

# 32. AI Extraction Architecture

The pipeline should use several small AI tasks rather than one large prompt.

```text
Document
   ↓
Source Structure Agent
   ↓
Source Model
   │
   ├── Knowledge Extraction Agent
   │
   ├── Curriculum Extraction Agent
   │
   ├── Assessment Evidence Agent
   │
   └── Activity Evidence Agent
          ↓
      Validation
          ↓
    Enrichment Agent
```

Agents should operate on bounded sections.

Avoid sending an entire large PDF to every agent.

---

# 33. Extraction Agent Contract

Every extraction agent should receive:

```text
Source section
Source metadata
Extraction task
Allowed output schema
```

And return:

```text
structured JSON
+
source references
+
confidence/review flags
```

Example:

```json
{
  "items": [],
  "reviewRequired": false,
  "warnings": []
}
```

---

# 34. No Hallucinated Enrichment

The extraction agent must NOT:

* add facts from general knowledge
* correct the source silently
* rewrite source meaning
* invent objectives
* invent curriculum sequence
* invent assessments
* invent activities

If something is ambiguous:

```text
flag for review
```

rather than guessing.

---

# 35. Pipeline Configuration

A pipeline configuration can eventually describe:

```json
{
  "source": {
    "type": "pdf",
    "parser": "liteparse"
  },
  "outputs": [
    "knowledge",
    "curriculum",
    "evidence"
  ],
  "language": "en"
}
```

`outputs` names extraction outputs, not pack files — `evidence` is the review-artifact stream (§22–§23), never a pack type. Pack types are `knowledge` and `curriculum` only (Pack System §5).

But this should remain simple initially.

---

# 36. MVP Pipeline

The first implementation should support exactly this:

```text
PDF
 ↓
Parser (liteparse)
 ↓
Markdown
 ↓
Normalize
 ↓
Source Model
 ↓
Knowledge Extraction
 ↓
Curriculum Extraction
 ↓
Evidence Extraction (assessment + activity, review/ only)
 ↓
Validation
 ↓
Human Review
 ↓
Knowledge Pack + Curriculum Pack
```

Do not build a generalized pipeline framework before this works.

---

# 37. First Implementation: NIOS Mathematics Level A

Use:

```text
Math_Level_A_english_medium.pdf
```

as the first fixture.

The objective is not to create the entire NIOS ecosystem immediately.

Instead:

```text
PDF
 ↓
Parser (liteparse)
 ↓
Markdown
 ↓
Source Model
 ↓
Extract Lessons 1–7
 ↓
Generate Knowledge Pack
 ↓
Generate Curriculum Pack
 ↓
Validate
```

The source itself contains a manageable lesson structure including numbers, addition/subtraction, multiplication, division, fractions, measurement and geometry, with assessment points.

---

# 38. Second Implementation: NIOS EVS Level A

Once Mathematics works, run the same pipeline against:

```text
EVS_Level_A_english_medium.pdf
```

The purpose is to test whether the pipeline generalizes to a less computational subject.

The EVS source includes lessons, recurring assessment structures, practical "Let's do and learn" activities, and real-world learner contexts.

If the same Source Model and extraction contracts work for both, the architecture is probably at the right level.

---

# 39. Repository — Resolved

0.1 proposed a new `openedu-course-pipeline/` repo and left the question open. **Resolved by OPENEDU-PACK-SYSTEM §26.3:**

> Ingestion lives in the standalone `open-edu-pipeline` repo… Packs are its output format.

So the pipeline lives **here**, in this repository, restructured into two clearly separated concerns:

```text
open-edu-pipeline/
├── docs/
│   └── OPENEDU-KNOWLEDGE-EXTRACTION.md     # this document
│
├── packages/
│   ├── pack-extraction/                     # NEW — Stages 1–7 of this spec
│   │                                        #   (name avoids collision with the
│   │                                        #   existing pipeline/src/extraction/ module)
│   │   ├── src/
│   │   │   ├── ingest/                      #   Stage 1 (manifest, fixtures)
│   │   │   ├── parse/                       #   Stage 2 (liteparse, existing extraction/)
│   │   │   ├── normalize/                   #   Stage 3 (existing normalizer.ts)
│   │   │   ├── source-model/                #   Stage 4
│   │   │   ├── knowledge/                   #   Stage 5  (knowledge statements,
│   │   │   ├── curriculum/                  #   Stage 5B   glossary, examples,
│   │   │   ├── evidence/                    #   Stage 5C/D  assessment, activity)
│   │   │   ├── enrich/                      #   Stage 6
│   │   │   ├── validate/                    #   Stage 7
│   │   │   └── emit/                        #   pack writer (PackManifest/Concept/Curriculum)
│   │   └── prompts/
│   │       ├── source-understanding/
│   │       ├── knowledge-extraction/
│   │       ├── curriculum-extraction/
│   │       ├── evidence-extraction/
│   │       └── validation/
│   │
│   ├── pipeline/                            # EXISTING — course-spec generation;
│   │                                        #   refactored over time to consume packs
│   │                                        #   instead of re-deriving concepts from source
│   │
│   └── pipeline-llm/                        # EXISTING — shared LLM stage config
│
├── fixtures/
│   └── nios-math-a/
│
└── output/                                  # working artifacts (not packs)
    └── nios-math-a/
        ├── source/                          #   parsed + normalized markdown
        ├── source-model/
        └── review/                          #   knowledge statements, glossary,
                                             #   assessment/activity evidence
```

Pack schemas are **not** re-declared here: `emit/` conforms to `PackManifestSchema` / `ConceptSchema` / `CurriculumSchema` from `@open-edu/packs` (Pack System story 1.1). Until that package ships, `pack-extraction/` carries a local mirror of the three schemas with a comment pointing at the canonical source, and a test that fails when the canonical schemas land.

---

# 40. What the Pipeline Does Not Do

This pipeline does NOT generate the final learner experience.

It produces educational building blocks.

```text
Pipeline
  ↓
Knowledge Pack
Curriculum Pack
Review Evidence
       ↓
OpenEdu Studio
       ↓
Authoring Context
       ↓
AI + Tutor
       ↓
Course Spec          (CourseSpecJSONSchema — the blueprint;
       ↓              Pack System §19, no separate artifact)
OpenEdu Course
```

This separation is important. Note: 0.1's "Course Blueprint" step is the existing `CourseSpecJSONSchema`; the Pack System eliminated the blueprint as a distinct artifact.

---

# 41. Relationship to OPENEDU-PACK-SYSTEM

The two specifications have different responsibilities.

### `OPENEDU-PACK-SYSTEM.md`

Defines:

> What is a Pack and how does OpenEdu consume it?

**Authoritative for pack shape** — schemas, IDs, layout, provenance contract.

### `OPENEDU-KNOWLEDGE-EXTRACTION.md` (this document)

Defines:

> How do we create trustworthy Packs from educational source material?

**Authoritative for pack production** — stages, extraction rules, validation, human review.

### Precedence

Where the two disagree about what a pack *is*, the Pack System wins; where they disagree about how packs are *made*, this document wins. Reconciliation changes from 0.1 → 0.2 are listed in §0.

Together:

```text
                 SOURCE
                   │
                   ▼
        Knowledge Extraction Pipeline
                   │
                   ▼
                PACKS
                   │
                   ▼
           OpenEdu Pack System
                   │
                   ▼
            OpenEdu Studio
```

### 41.1 Relationship to the existing course-spec pipeline in this repo

This repository already ships an 8-stage generation pipeline (`packages/pipeline`: extract → source inventory → concept map → lesson blueprints → activity generation → asset plan → validation → `course-spec.json`). Its relationship to this spec:

* **It is not this pipeline.** It goes end-to-end from PDF to a course spec — precisely the `PDF → LLM → finished course` shortcut §2 forbids — and its intermediate artifacts (`concept-map.json`, `lesson-blueprints.json`) carry no provenance contract.
* **It is the downstream consumer, re-pointed.** Stages 1–3 (extract / normalize / inventory) overlap and get shared via `packages/pack-extraction`; stages 4–6 (concept map → blueprints → activities) are eventually replaced by Studio generating from packs (§40). The generation pipeline's pack-consuming form is the Pack System's Phase 2 story *"Source-document → pack ingestion in `open-edu-pipeline`."*
* **Migration order:** build the extraction path first (§46 vertical slice), prove packs load in Studio, then refactor generation stages to read packs. Do not delete the existing pipeline before its replacement works — it is the only end-to-end path that currently runs.

---

# 42. Future Sources

The pipeline should eventually support sources other than PDFs.

The conceptual contract is:

```text
PDF ────────┐
DOCX ───────┤
HTML ───────┤
EPUB ───────┼──→ Source Representation
Web page ───┤
Markdown ───┘
```

Only the ingestion/parser stage should need to change.

Everything after:

```text
Source Representation
```

should remain largely the same.

This is one of the main reasons to introduce Markdown and the Source Model now.

---

# 43. Long-Term Architecture

The mature architecture becomes:

```text
                         SOURCE TYPES
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
       PDF/DOCX              HTML              Markdown
          │                   │                   │
          ▼                   ▼                   │
      Parsers / Normalizers ──┴───────────────────┘
                              │
                              ▼
                     SOURCE REPRESENTATION
                              │
                              ▼
                        SOURCE MODEL
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
        KNOWLEDGE        CURRICULUM       ASSESSMENT
        EXTRACTION       EXTRACTION       EXTRACTION
             │                │                │
             ▼                ▼                ▼
        KNOWLEDGE        CURRICULUM       EVIDENCE
           PACK              PACK
             │                │
             └────────────────┘
                      │
                      ▼
              OPENEDU PACK SYSTEM
                      │
                      ▼
                AUTHORING CONTEXT
                      │
              ┌───────┴────────┐
              ▼                ▼
          STUDIO            AI AGENT
              │                │
              └───────┬────────┘
                      ▼
                COURSE BLUEPRINT
                      │
                      ▼
                 OPENEDU COURSE
```

---

# 44. Core Invariants

The pipeline must preserve these invariants:

### Invariant 1 — Source survives

The original source is never replaced by generated content.

### Invariant 2 — Parsing is not interpretation

The parser structures the document; it does not define OpenEdu knowledge.

### Invariant 3 — Extraction is source-grounded

Knowledge claims must be traceable to source evidence.

### Invariant 4 — Curriculum is separate

Curriculum structure must not be flattened into the Knowledge Pack.

### Invariant 5 — Enrichment is labeled

OpenEdu-derived pedagogical recommendations must be distinguishable from source-derived facts.

### Invariant 6 — Provenance survives

A tutor must eventually be able to ask:

> Where did this come from?

and Studio should be able to trace it.

### Invariant 7 — Packs remain portable

Knowledge Packs must not depend on a particular database, vector store, or AI provider.

### Invariant 8 — Human review remains possible

The pipeline must produce inspectable intermediate artifacts.

---

# 45. Definition of Done

The first version is complete when we can take:

```text
Math_Level_A_english_medium.pdf
```

and produce:

```text
output/nios-math-a/
  source/
    nios-math-a.md                    # parsed + normalized markdown

  source-model/
    nios-math-a.json                  # Source Model (§11)

  review/                             # audit trail, NOT part of any pack
    knowledge-statements.json
    glossary-candidates.json
    assessment-evidence.json
    activity-evidence.json
    fidelity-report.json              # §27 source-fidelity results
    human-review-flags.json

  packs/                              # conforms to Pack System §7 —
    knowledge/                        #   this is what OPEN_EDU_PACKS_DIR
      nios-math-a-knowledge/          #   points at
        manifest.json                 #   PackManifestSchema, derivedFrom: "document"
        concepts.json                 #   ConceptSchema[] with ConceptSourceSchema
        sources.json
    curriculum/
      nios-math-level-a/
        manifest.json
        curriculum.json               #   CurriculumSchema
        sources.json
```

with:

```text
✓ source provenance (ConceptSourceSchema on every concept, required by derivedFrom)
✓ validated references (no cycles, all concept refs resolve)
✓ extracted concepts
✓ source-grounded knowledge (§14 extract-before-interpreting rule)
✓ examples and terminology inline on concepts (§7.1 of Pack System)
✓ curriculum structure and objectives (requiresIntents from LearningIntent enum)
✓ assessment and activity evidence in review/ (not in the pack)
✓ human-review flags
✓ pack passes @open-edu/packs validation (PackManifestSchema, .strict())
```

and no requirement for a large custom knowledge graph, marketplace, vector infrastructure, or autonomous multi-agent system.

---

# 46. Recommended Next Step

Do **not** implement the entire pipeline immediately.

First build a thin vertical slice:

```text
NIOS Math PDF
      ↓
Parser (liteparse)
      ↓
Markdown
      ↓
Source Model
      ↓
ONE lesson
      ↓
Knowledge extraction
      ↓
Validation
      ↓
Human review
      ↓
Knowledge Pack
```

Use one lesson to test the contract.

Once that works, expand to:

```text
1 lesson
→ 1 unit
→ entire Math Level A
→ EVS Level A
→ generalized pipeline
```

That gives us a much safer path to discovering what the actual `Knowledge Pack` schema needs to be, rather than designing the schema theoretically before seeing the extracted NIOS data.

