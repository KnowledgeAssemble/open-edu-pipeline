# Implementation Plan — Knowledge Extraction Pipeline (Vertical Slice)

**Plan version:** 1.0
**Spec:** `docs/OPENEDU-KNOWLEDGE-EXTRACTION.md` v0.2 (this plan implements its §46 thin vertical slice)
**Pack contract:** `/open-edu/docs/OPENEDU-PACK-SYSTEM.md` v0.3 (authoritative for pack shape)
**Executor note:** written for an autonomous agent running on `deepseek-4-flash`. It is designed to be executed **deterministically**: no external LLM/API calls, no live model calls, no keys required. Exact schemas, strings, and commands are embedded below — copy them, do not redesign.

---

## 0. Mission

Build the **thin vertical slice** from OPENEDU-KNOWLEDGE-EXTRACTION.md §46 in this repo:

```text
ONE markdown lesson (fixture)
      ↓
Normalize → Source Model
      ↓
Knowledge Extraction (deterministic)
      ↓
Curriculum Extraction (deterministic)
      ↓
Validation
      ↓
Emit two packs (knowledge + curriculum)
```

Prove the pack contract end-to-end for **one** lesson of NIOS Mathematics Level A. Do **not** build generalization, LLM integration, PDF parsing, or the full 8-stage pipeline. Do **not** touch `packages/pipeline` or `packages/pipeline-llm`.

---

## 1. Constraints & Rules for the Executing Agent

1. **Follow the steps exactly.** Every file path, type name, string, and command below is the spec. If a step is impossible, STOP and report — do not improvise a design.
2. **No LLM calls.** No `deepseek`/`openai`/`openrouter` provider use in this slice. The extractor is deterministic.
3. **No new dependencies** beyond what is listed in each task.
4. **Do not modify** `packages/pipeline/**`, `packages/pipeline-llm/**`, the root `pnpm` scripts you are not told to change, or any existing test.
5. **Never work on `main`.** Create a branch (`git checkout -b feat/knowledge-extraction-slice`) before Task 1. (A git worktree is allowed but not required.)
6. The pack schemas are mirrored **locally** in the new package per spec §39 (a test documents that `@open-edu/packs` is the future canonical source). Keep zodschema reflection; do not hand-roll validators.
7. Run the verification block at the end of **every** task before marking it done. If verification fails, fix within the task; if you cannot, stop and report.
8. Do not add code comments beyond the ones explicitly shown; TypeScript strict mode is on.

---

## 2. Ground Truth (copy these exactly)

Pack System schemas — the local mirror must accept exactly this and reject anything extra (`.strict()`).

### 2.1 `PackManifestSchema` (spec OPENEDU-PACK-SYSTEM §8.1)

```ts
// format: literal "openedu-pack"
// formatVersion: literal 1
// type: enum ["knowledge", "curriculum"]
// id: /^[a-z0-9][a-z0-9_-]*$/, min 1, max 128
// version: /^\d+\.\d+\.\d+$/, min 1, max 64
// name: min 1, max 256
// description?: max 4096
// author: min 1, max 128
// language: enum ["en","hi","or"], default "en"
// requires: array of kebab-case ids, default []
// derivedFrom?: literal "document"
// .strict()
```

### 2.2 `ConceptSourceSchema` (spec §9.2)

```ts
// documentId: string min 1 max 128
// locator?: string max 256
// section?: string max 256
// page?: number int positive
// excerpt?: string max 2000
```

### 2.3 `ConceptSchema` (spec §9.2)

```ts
// id: kebab-case /^[a-z0-9][a-z0-9_-]*$/ min 1 max 128
// title: min 1 max 256
// summary: min 1 max 2000
// domainTags: string[] min 1 (each min 1 max 64)
// examples?: string[] max 10 (each max 1000)
// misconceptions?: string[] max 10 (each max 1000)
// prerequisites?: string[] max 20 (each min 1 max 128, kebab-case)
// source?: ConceptSourceSchema
// .strict()
```

### 2.4 `CurriculumSchema` (spec §10.2)

```ts
// ConceptRefSchema: { pack: kebab-case, concept: kebab-case } .strict()
// ObjectiveSchema: {
//   id: kebab-case,
//   description: min 1 max 500,
//   bloomLevel?: enum ["remember","understand","apply","analyze","evaluate","create"],
//   concepts: ConceptRefSchema[] default [],
//   requiresIntents: array of LearningIntent min 1
// } .strict()
// CurriculumUnitSchema: {
//   id: kebab-case,
//   title: min 1 max 256,
//   description?: max 2000,
//   concepts: ConceptRefSchema[] default [],
//   objectives: ObjectiveSchema[] min 1,
//   estimatedMinutes?: int positive,
//   prerequisites: string[] default []
// } .strict()
// CurriculumSchema: {
//   id: kebab-case, title: min 1 max 256, subject: min 1 max 128,
//   level?: max 64, units: CurriculumUnitSchema[] min 1
// } .strict()
```

### 2.5 `LearningIntent` enum (Pack System §6.1) — 11 members

```ts
'assess' | 'practice' | 'observe' | 'compare' | 'explore' | 'create' |
'reflect' | 'apply' | 'listen' | 'recall' | 'understand'
```

### 2.6 The fixture (exact content)

New file `fixtures/nios-math-a/lesson-5-fractions.md` (verbatim — heading structure mirrors spec §5):

````md
# Lesson 5: Fractions

## Learning Objectives

After this lesson, the learner can:

* recognise a fraction as a part of a whole
* identify the numerator and the denominator
* represent a fraction on a number line

## Introduction

A fraction is **part of a whole**. When we divide one whole into equal parts, each part is a fraction of the whole. We write a fraction as **numerator over denominator**, for example 3/4.

**Fraction** — a part of a whole divided into equal parts.
**Numerator** — the number of equal parts we take.
**Denominator** — the total number of equal parts.

## Let's Learn

The denominator tells us how many equal parts the whole is divided into. The numerator tells us how many parts we put together.

## Example

**Example 1:** The whole is divided into 4 equal parts. We take 3 parts. The fraction is 3/4. 3 is the numerator and 4 is the denominator.

**Example 2:** On a number line, the points between 0 and 1 are divided into equal parts. The fraction 1/2 is exactly at the middle of 0 and 1.

## Exercise

1. Write the fraction for: 2 equal parts, we take 1 part.
2. Which number is the denominator in 3/4?
3. Draw a number line and mark 1/4.

## Let's Do and Learn

Use paper strips to show that 2/4 is equal to 1/2.
````

This yields exactly **6 sections** (see Task 3): `learning-objectives`, `introduction`, `let-s-learn`, `example`, `exercise`, `let-s-do-and-learn`.

And `fixtures/nios-math-a/source-manifest.json`:

```json
{
  "id": "nios-math-level-a",
  "title": "Mathematics Level A",
  "format": "markdown",
  "filename": "lesson-5-fractions.md"
}
```

**Why a markdown fixture:** §46 says test the contract with one lesson before building parsing; the original PDF is not in this repo. Parsing (Stage 2) is explicitly out of slice scope.

---

## 3. Expected Output (Definition of Done for the slice)

Running the slice CLI produces exactly:

```text
output/nios-math-level-a/
  source/
    lesson-5-fractions.md            # copy of fixture
  source-model/
    source-model.json                # Source Model (§11)
  review/
    knowledge-model.json             # knowledge statements, glossary, examples
    curriculum-model.json
    glossary-candidates.json
    fidelity-report.json             # { "status": "pending-llm" } (honest marker)
    human-review-flags.json          # { "items": [], "generatedAt": ... }
  packs/
    knowledge/
      nios-math-a-knowledge/
        manifest.json
        concepts.json
        sources.json
    curriculum/
      nios-math-slice/
        manifest.json
        curriculum.json
        sources.json
```

**Working-directory derivation (fixed rule):** the CLI writes under `--output/<manifest.id>/` where `manifest.id` is read from `fixtures/nios-math-a/source-manifest.json` (`nios-math-level-a`). The subdir is NOT the pack id and NOT the doc title — it matches the `documentId` namespace (§20 id-hygiene note in the spec). The three distinct strings are: working dir / `documentId` = `nios-math-level-a`, knowledge pack id = `nios-math-a-knowledge`, curriculum pack id = `nios-math-slice`.

The fixture has **3 concepts** (fraction, numerator, denominator). The pack must pass the schema mirror and the extra checks (source required, refs resolve, no cycles, unique kebab-case ids). `source/normalized.md` is intentionally absent: normalization is a no-op on the fixture, so the CLI writes only the copy plus `source-model.json` (Task 7).

---

## 4. Tasks

Reproducible commands assume the repo root. Every task ends with: `pnpm build && pnpm test && pnpm typecheck && pnpm lint` (run from the new package, then again from repo root at the end).

---

### Task 1 — Scaffold package `packages/pack-extraction`

**Steps:**

1. Create `packages/pack-extraction/package.json`:

```json
{
  "name": "@open-edu/pack-extraction",
  "version": "0.1.0",
  "private": true,
  "description": "Source-grounded knowledge/curriculum pack extraction (vertical slice)",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint 'src/**/*.{ts,tsx}'",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0"
  }
}
```

2. Create `packages/pack-extraction/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

3. Create `packages/pack-extraction/src/index.ts` exporting only the pieces built in later tasks (start with an empty named export placeholder `export const VERSION = '0.1.0';`).

4. Run `pnpm install` at repo root (adds the workspace package to the lockfile).

**Verification (fail → fix within task, else stop and report):**
- `pnpm --filter @open-edu/pack-extraction build && pnpm --filter @open-edu/pack-extraction typecheck` exits 0.
- `pnpm --filter @open-edu/pack-extraction lint` exits 0.

---

### Task 2 — Local schema mirror (`src/schemas/`)

**Steps:**

1. Create `packages/pack-extraction/src/schemas/pack.ts` implementing §2.1 `PackManifestSchema` exactly.
2. Create `packages/pack-extraction/src/schemas/concept.ts` implementing §2.2 and §2.3 (`ConceptSourceSchema`, `ConceptSchema`).
3. Create `packages/pack-extraction/src/schemas/curriculum.ts` implementing §2.4 + §2.5, defining `LEARNING_INTENTS` as a `z.enum` of the 11 members and reusing it for `requiresIntents` (use `z.literal(...).array()` not `z.string()`).
4. Export all six from `src/schemas/index.ts`. Export types derived with `z.infer`.
5. Top of each file: a one-line comment `// Local mirror. Canonical source of truth: @open-edu/packs (open-edu repo, Pack System story 1.1).`
6. Create `packages/pack-extraction/src/schemas/pack.test.ts`:
   - `PackManifestSchema` parses the §29 example manifest (format openedu-pack, type knowledge) and rejects: (a) dotted id `"nios.math.level-a"`, (b) uppercase id, (c) an extra undeclared key `"x": 1` (proves `.strict()`), (d) missing `derivedFrom` allowed only when type has no doc claim — assert `derivedFrom: "document"` parses and a missing `derivedFrom` also parses (it is optional).
   - `ConceptSchema` rejects a concept missing `summary`, missing `domainTags`, and one with an undeclared `type` key (`.strict()`); accepts a concept with all fields including `source`.
   - `ConceptSourceSchema` accepts `{ documentId, section, page }`; rejects negative `page`.
   - `CurriculumSchema` accepts the §20 example shape; rejects an objective without `requiresIntents`.

**Verification:** task-level build/test/typecheck/lint block above.

---

### Task 3 — Source Model types + deterministic normalizer (`src/source-model/`)

**Steps:**

1. Create `packages/pack-extraction/src/source-model/types.ts`:

```ts
export type SectionType =
  | 'objective' | 'content' | 'example' | 'exercise' | 'activity' | 'assessment' | 'note';

export interface SourceSection {
  id: string;              // slugified heading, e.g. "learning-objectives"
  type: SectionType;
  title: string;           // raw heading text, e.g. "Learning Objectives"
  headingLevel: number;    // '#' count
  lines: string[];         // non-empty content lines under the heading
  sourcePages?: number[];  // optional; unused in slice
}

export interface SourceDocumentModel {
  document: { id: string; title: string };
  sections: SourceSection[];
}
```

2. Create `packages/pack-extraction/src/source-model/normalize.ts`:
   - Export `SLUG_RE = /^(#{1,6})\s+(.*)$/`.
   - Export `sectionTypeFor(title: string): SectionType` mapping exactly:
     - contains `objective` (case-insensitive) → `'objective'`
     - contains `example` → `'example'`
     - contains `exercise` → `'exercise'`
     - contains `let's do and learn` (case-insensitive) → `'activity'`
     - contains `assessment` | `test` → `'assessment'`
     - contains `note` → `'note'`
     - else → `'content'`
   - Export `slugify(title: string): string` (lowercase, non-alphanumeric → `-`, collapse repeats, trim `-`). Heading text slug examples: `Learning Objectives` → `learning-objectives`.
   - Export `parseMarkdown(markdown: string): SourceDocumentModel` that splits on `SLUG_RE`; the first `# ` heading sets the document title; every subsequent heading starts a section collecting the following non-empty lines. If a section has no content lines it is still emitted (do not drop). **`document.id` is set to `''`** — the manifest id is not available at parse time; the CLI overwrites it with `manifest.id` before extraction (Task 7).
   - Do not add helpers beyond those listed here.
3. Create `packages/pack-extraction/src/source-model/normalize.test.ts`:
   - Export (in the test file) the fixture via a **cwd-independent path**, because relative `node:fs` paths resolve against `process.cwd()` (which differs between a `--filter` run and the CLI run):

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const FIXTURE = readFileSync(
  fileURLToPath(new URL('../../../../fixtures/nios-math-a/lesson-5-fractions.md', import.meta.url)),
  'utf8',
);
```

   - Parsing `FIXTURE` yields **6 sections** with ids `learning-objectives`, `introduction`, `let-s-learn`, `example`, `exercise`, `let-s-do-and-learn`, and types `objective`, `content`, `content`, `example`, `exercise`, `activity`.
   - `sectionTypeFor('Learning Objectives') === 'objective'`.
   - `slugify("Let's Learn") === 'let-s-learn'` and `slugify('Example') === 'example'`.

**Verification:** task block.

---

### Task 4 — Deterministic knowledge extraction (`src/knowledge/`)

**Steps:**

1. Create `packages/pack-extraction/src/ingest/types.ts` **first** (this is where `SourceManifest` lives, per spec §39's `ingest/`):

```ts
export interface SourceManifest {
  id: string;        // kebab-case, e.g. "nios-math-level-a"
  title: string;
  format: string;    // "markdown" in the slice
  filename: string;
}
```

2. Create `packages/pack-extraction/src/knowledge/types.ts`:

```ts
export interface KnowledgeStatement {
  id: string;            // e.g. "fraction-part-of-whole"
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
  examples: string[];          // ≤ 10
  misconceptions: string[];    // ≤ 10
  prerequisites: string[];     // ≤ 20, same-pack ids
}

export interface KnowledgeModel {
  documentId: string;
  concepts: ConceptCandidate[];
  statements: KnowledgeStatement[];
  glossary: GlossaryCandidate[];
}
```

3. Create `packages/pack-extraction/src/knowledge/glossary.ts`:
   - Export `parseGlossaryTerm(line: string): { term: string; definition: string } | null`.
   - Matches `**Term** — definition` OR `**Term**: definition` (regex `^\*\*([^*]+)\*\*\s*[—:]\s*(.+)$`).
4. Create `packages/pack-extraction/src/knowledge/extract.ts`:
   - Export `extractKnowledge(doc: SourceDocumentModel, manifest: SourceManifest): KnowledgeModel`.
   - Produce one `ConceptCandidate` per unique glossary term found in `glossary` lines (the terms `fraction`, `numerator`, `denominator` for the fixture — a term appearing once in `Introduction`).
   - `source` on each concept: `documentId` from manifest, `section` = the section id where the term appeared.
   - `summary` = the glossary definition text capped to 2000 chars.
   - `domainTags` = `["mathematics"]` for all (hardcoded for slice; the fixture is math).
   - From **Example _N_** paragraphs under the **`example` section** (regex `^\*\*Example (\d+)\*\*:(.+)$` — the fixture's `## Example` section holds these lines directly), append each as an `examples[]` entry to the **first** concept (order: fraction first — keep concepts in glossary-appearance order).
   - A `KnowledgeStatement` per `*` bullet under `learning-objectives` (statement text after the leading `*`).
   > **Deliberate slice simplification:** every statement's `conceptId` is the **first concept id** (`fraction`). Do NOT attempt keyword matching against "numerator"/"denominator" — that is a later enhancement, not the contract being proven here.
   - `glossary[]` = one `GlossaryCandidate` per `**Term**` line.
   - `examples`/`misconceptions` on a concept capped at 10; if the source yields more, keep the first 10 (`Array.prototype.slice(0, 10)`).
5. Create `packages/pack-extraction/src/knowledge/extract.test.ts`:
   - Source manifest id `nios-math-level-a` + the fixture document → concepts ids `["fraction","numerator","denominator"]`; 3 statements; 2 examples on `fraction`; glossary length 3; every concept has a `source.documentId` of `nios-math-level-a`.
   - A `**Term** — def` line parses via `parseGlossaryTerm`.
   - A plain sentence does not.

**Verification:** task block.

---

### Task 5 — Deterministic curriculum extraction (`src/curriculum/`)

**Steps:**

1. Create `packages/pack-extraction/src/curriculum/extract.ts`:
   - Export `extractCurriculum(knowledge: KnowledgeModel, doc: SourceDocumentModel): CurriculumLikeness` where `CurriculumLikeness` is the intermediate shape: one unit whose `id` is `slugify(doc.document.title)` (`lesson-5-fractions`), whose `objectives` come from `knowledge.statements`, `requiresIntents` `["understand"]`, `concepts` = one `ConceptRef` per knowledge concept id, `bloomLevel` default `"understand"`.
   - Export `toCurriculum(c: CurriculumLikeness, refs: { knowledgePackId: string; curriculumPackId: string }): CurriculumSchema`. `CurriculumSchema.id` = `refs.curriculumPackId`; unit `concepts[i] = { pack: refs.knowledgePackId, concept: id }`.
   - **ID namespaces (do not mix):** the curriculum pack `manifest.json` `id`, the `CurriculumSchema.id`, and the knowledge pack `manifest.json` `id` are **three distinct strings**. In the slice: curriculum pack id = `nios-math-slice` (passed by the CLI), `CurriculumSchema.id` = same `nios-math-slice`, knowledge pack id = `nios-math-a-knowledge`. `documentId` (`nios-math-level-a`) is a fourth, separate namespace.
2. Create `packages/pack-extraction/src/curriculum/extract.test.ts`:
   - `toCurriculum(output, { knowledgePackId: 'nios-math-a-knowledge', curriculumPackId: 'nios-math-slice' })` passes `CurriculumSchema` with `id === 'nios-math-slice'`; objectives have `requiresIntents: ["understand"]`; every `concepts[].pack` equals `nios-math-a-knowledge`; every `concepts[].concept` matches a knowledge concept id; does not reference an unknown concept.

**Verification:** task block.

---

### Task 6 — `emit/` (pack writer) and `validate/` (pack validator)

**Steps:**

1. Create `packages/pack-extraction/src/emit/write.ts`:
   - Export `writeJson(filePath: string, value: unknown): void` using `node:fs` `mkdirSync({ recursive: true })` + `writeFileSync(JSON.stringify(value, null, 2) + '\n')`.
   - Layout matches §3 `packs/` tree; filenames exactly `manifest.json`, `concepts.json`, `sources.json` (knowledge) and `manifest.json`, `curriculum.json`, `sources.json` (curriculum).
   - **Two emit functions** (one pack each — do NOT merge into a single one):

```ts
export interface KnowledgePackInput {
  outputDir: string;      // e.g. output/nios-math-level-a/packs
  manifest: PackManifest; // zod-inferred, type 'knowledge'
  concepts: ConceptSchema[];
  sources: { documents: Array<{ documentId: string; title: string; file: string }> };
}
export function emitKnowledgePack(input: KnowledgePackInput): { paths: string[] };

export interface CurriculumPackInput {
  outputDir: string;              // e.g. output/nios-math-level-a/packs
  manifest: PackManifest;         // zod-inferred, type 'curriculum'
  curriculum: CurriculumSchema;
  sources: { documents: Array<{ documentId: string; title: string; file: string }> };
}
export function emitCurriculumPack(input: CurriculumPackInput): { paths: string[] };
```

   - Knowledge pack writes `packs/knowledge/<id>/manifest.json + concepts.json + sources.json`.
   - Curriculum pack writes `packs/curriculum/<id>/manifest.json + curriculum.json + sources.json`.
   - **Every pack gets its own `sources.json`** (same `{ documents: [...] }` shape — keep exactly the proposed shape from spec §30).
   - Knowledge manifest: `type: 'knowledge'`, `id: 'nios-math-a-knowledge'`, `version: '0.1.0'`, `name: 'NIOS Mathematics Level A — Knowledge'`, `author: 'KnowledgeAssemble'`, `language: 'en'`, `derivedFrom: 'document'`.
   - Curriculum manifest: `type: 'curriculum'`, `id: 'nios-math-slice'`, `version: '0.1.0'`, `name: 'NIOS Mathematics Level A — Curriculum Slice'`, `author: 'KnowledgeAssemble'`, `language: 'en'`, `derivedFrom: 'document'`.
2. Create `packages/pack-extraction/src/validate/pack.ts`:

```ts
export type PackResult = { ok: true; report: string[] } | { ok: false; errors: string[] };
```

   - Export `validateKnowledgePack(kindDir: string): PackResult` — reads `manifest.json` + `concepts.json`, runs both through the zod mirror, then spec §26 checks: `derivedFrom: 'document'` → every concept has a `source`; unique concept ids; prerequisite self-reference and cycles (DFS, Pack System §9.3).
   - Export `validateCurriculumPack(kindDir: string, knowledgeConceptIds: Set<string>): PackResult` — reads `manifest.json` + `curriculum.json` through the zod mirror, then: every `concepts[].pack` equals a known knowledge pack id, every `concepts[].concept` ∈ `knowledgeConceptIds`; unit `prerequisites` reference sibling unit ids only.
   - Report lines are human-readable: `concepts: 3`, `concept fraction: source OK`, `ref fraction (nios-math-a-knowledge): OK`.
   - The function names and the knowledge-concept-set parameter are **mandatory** — cross-pack reference resolution is the spec §26 curriculum-check.
3. Create `packages/pack-extraction/src/emit/emit.test.ts` and `packages/pack-extraction/src/validate/pack.test.ts`:
   - `emitKnowledgePack` / `emitCurriculumPack` write all 6 files (3 each) under a temp dir (`os.tmpdir()` + crypto `randomUUID`, removed in `afterEach`).
   - Copy a valid emitted tree → `validateKnowledgePack` / `validateCurriculumPack` return `ok: true`.
   - Insert an extra key into `concepts.json` → `ok: false` (strictness proven on-disk).
   - Remove `source` from a concept → `ok: false` (derivedFrom gate).
   - Introduce a prerequisite cycle → `ok: false`.
   - A curriculum concept ref `{ pack: 'nios-math-a-knowledge', concept: 'misspell' }` with `misspell` not in the passed set → `ok: false`.

**Verification:** task block.

---

### Task 7 — CLI and root wiring

**Steps:**

1. Create `packages/pack-extraction/src/cli/index.ts` (bin `pack-extract`) with `parseArgs` handling exactly:
   - `--source <markdown-file>` (required)
   - `--manifest <manifest-file>` (required)
   - `--output <dir>` (default `./output`)
   - `--curriculum-pack-id <id>` (default `nios-math-slice`)
   - `--knowledge-pack-id <id>` (default `nios-math-a-knowledge`)
   - `--validate` (run `validateKnowledgePack` + `validateCurriculumPack` on emitted dirs, exit 1 if either is `ok: false`)
   - `--help` prints usage and exits 0.
   - Parse manually (no arg library) to avoid a dependency.
2. Program flow (single main exported as `run(argv: string[]): Promise<number>`), in this exact order:

```text
1. read SourceManifest from --manifest
2. read markdown from --source
3. workingDir = path.join(--output, manifest.id)        // §3 derivation rule → output/nios-math-level-a
4. doc = parseMarkdown(markdown); doc.document.id = manifest.id   // overwrite the '' from Task 3
5. write source/lesson-5-fractions.md (copy), source-model/source-model.json
   (skip source/normalized.md — it is the same content in the slice)
6. knowledge = extractKnowledge(doc, manifest)
7. write review/knowledge-model.json, review/glossary-candidates.json
8. curriculum = toCurriculum(extractCurriculum(knowledge, doc), { knowledgePackId, curriculumPackId })
9. write review/curriculum-model.json
10. knowledgePack = emitKnowledgePack({ outputDir: workingDir/packs, manifest: <constructed knowledge manifest>, concepts: knowledge.concepts mapped to ConceptSchema, sources: { documents: [{documentId: manifest.id, ...}] } })
11. curriculumPack = emitCurriculumPack({ outputDir: workingDir/packs, manifest: <constructed curriculum manifest>, curriculum, sources: { documents: [...] } })
12. if --validate:
      knowledgeIdSet = new Set(knowledge.concepts.map(c => c.id))
      vr = validateKnowledgePack(knowledgePack.paths[0]-parent)
      cr = validateCurriculumPack(curriculumPack.paths[0]-parent, knowledgeIdSet)
      if !vr.ok or !cr.ok → print errors, return 1
13. write review/fidelity-report.json = { status: 'pending-llm' }
    write review/human-review-flags.json = { items: [], generatedAt: <new Date().toISOString()> }
14. return 0
```

   Any thrown error → `console.error`, return 1.

   Note: `source-model/source-model.json` in step 5 is the §3 Source Model artifact. The §3 `source/normalized.md` is dropped because normalization is a no-op on the fixture; a `<document.id>-source-model.json` naming is NOT used here (keep `source-model.json` exactly). The "Example N" regex lives in `knowledge/extract.ts` (Task 4), not in the CLI.
3. Add to `packages/pack-extraction/package.json` a `bin` entry `{ "pack-extract": "./dist/cli/index.js" }` and scripts `"extract:slice": "node dist/cli/index.js --source ../../fixtures/nios-math-a/lesson-5-fractions.md --manifest ../../fixtures/nios-math-a/source-manifest.json --output ../../output --validate"`.
4. Root `package.json`: add script `"extract:slice": "pnpm --filter @open-edu/pack-extraction extract:slice"` and (if `"build"` works with `-r`) ensure `packages/pack-extraction` is built by it — `pnpm -r run build` already covers workspace packages.

**Verification:** task block.

---

### Task 8 — End-to-end slice test + final verification

**Steps:**

1. Create `packages/pack-extraction/src/e2e/slice.test.ts` (or `src/__tests__/slice.test.ts`):
   - Invokes `run(['--source', FIXTURE, '--manifest', MANIFEST, '--output', temp, '--validate'])`; asserts exit code 0; then reads each expected file path from §3 (relative to `temp/nios-math-level-a`, the derived working dir) and asserts existence; reads `packs/knowledge/nios-math-a-knowledge/concepts.json` and asserts concept ids `['fraction','numerator','denominator']`.
   - Uses `beforeAll`/`afterAll` temp-dir behavior like the emit tests.
2. Run the fixture CLI for real once:
   `pnpm --filter @open-edu/pack-extraction build && pnpm extract:slice`
3. Confirm the `output/nios-math-level-a/packs/` tree exists and `output/nios-math-level-a/review/fidelity-report.json` contains `{"status":"pending-llm"}`.

**Verification (full, from repo root):**
```bash
pnpm install
pnpm build                  # builds all workspace packages
pnpm test                   # all workspace tests
pnpm typecheck
pnpm lint
pnpm format:check
```

All must exit 0. Then produce a final summary in the PR/result message: files created, pack ids, concept ids, and the exact command used.

---

## 5. Out of Scope for this plan (do NOT attempt)

- PDF/DOCX parsing (Stage 2), liteparse wiring
- LLM providers, prompts, `deepseek-4-flash` model calls, API keys, `.env`
- Enrichment (Stage 6) and `origin` classification writing to packs
- Human-review UI
- RAG/embeddings (spec §31)
- The existing `packages/pipeline` course-spec generation pipeline (spec §41.1)
- `@open-edu/packs` real dependency (only the local mirror per Task 2)

---

## 6. Stop-and-ask conditions (executing agent)

STOP and report instead of guessing when:
- `pnpm install` fails to resolve the new workspace package.
- Any verification command in a task fails twice after fixes within that task's scope.
- The fixture text changes/looks malformed (assume nothing).
- A required type from §2 cannot be expressed with `zod@3.22`. Prefer `z.enum([...])` (there are no TS enums in this plan; do not introduce `z.nativeEnum` or TS enum types) and `z.literal(...).array()` for the intents lists.
- You are about to modify files listed as out of scope or protected.

---

## 7. Definition of Done

- [ ] `pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` all green at repo root
- [ ] `pnpm extract:slice` produces the exact §3 tree under `output/nios-math-level-a/` (subdir = `--output/<manifest.id>`)
- [ ] `validateKnowledgePack` / `validateCurriculumPack` pass on both emitted packs; deliberately-corrupted packs fail
- [ ] `concepts.json` contains exactly `fraction`, `numerator`, `denominator`
- [ ] Every concept carries `source.documentId === 'nios-math-level-a'`
- [ ] No modifications to `packages/pipeline/**` or `packages/pipeline-llm/**`
- [ ] Work is on a feature branch, changed files are staged/committed once the user gives permission, and a brief result summary is reported (files, pack ids, command, verification output)