# Plan: Evolve @open-edu/pack-extraction to a generic knowledge-extraction pipeline (no changes to pipeline/pipeline-llm)

Spec context: `docs/OPENEDU-KNOWLEDGE-EXTRACTION.md` v0.2, `docs/IMPLEMENTATION-PLAN.md` v1.0 (thin slice). Constraint: do NOT modify `packages/pipeline/**` or `packages/pipeline-llm/**`.

## Mission

Evolve `packages/pack-extraction` to accept real documents (PDF/DOCX/PPTX etc via liteparse, or markdown passthrough), segment into multiple lessons, keep deterministic-first behavior, and add optional LLM enrichment (per spec §24) without merging enriched data into `derivedFrom: "document"` packs.

## 1. Constraints
- No edits to `packages/pipeline/**` or `packages/pipeline-llm/**` (must vendor copy)
- Keep all existing slice tests green (`packages/pack-extraction/src/e2e/slice.test.ts`, `normalize.test.ts`, `extract.test.ts`, `pack.test.ts`, `emit.test.ts`, `validate.test.ts`, `curriculum.test.ts`) 
- Backwards compatible: `extract:slice` behavior unchanged
- Deterministic by default; LLM enrichment only when `--enrich` (or explicit provider/model)
- Provenance: `origin: "source"` for deterministic; `origin: "enriched"` only in `review/`; `derivedFrom: "document"` gate remains
- Expose only what’s needed; no new top-level deps beyond existing + `@open-edu/pipeline-llm` (workspace) + `@llamaindex/liteparse` (same as pipeline)
- Binary deps: `lit`, `unzip` expected on PATH (documented)

## 2. Target package layout

Add:
- `src/parse/extraction/` — vendored from `packages/pipeline/src/extraction/` (interface, types, router, liteparse-extractor, normalizer, zip-handler, logger, adapter partial)
- `src/parse/index.ts` — facade (`parseToMarkdown`)
- `src/parse/adapter.ts` — `toSourceDocumentModel(result, manifest?)` producing `SourceDocumentModel`
- `src/source-model/segment.ts` — multi-lesson segmentation
- `src/ingest/manifest.ts` — manifest derivation
- `src/lib/logger.ts` — vendored from pipeline (or minimal copy)
- `src/profile/` — `types.ts`, `registry.ts`, `builtins/generic.ts` (vendored minimal)
- `src/config/stage-config.ts` — minimal config helpers
- `src/enrich/` — optional enrichment (loads pipeline-llm dynamically)

Keep existing: `src/{ingest,source-model,knowledge,curriculum,schemas,emit,validate,cli,test}`.

## 3. Phase 0 — Vendor parse/extraction utilities (verbatim)
Copy from `packages/pipeline/src/extraction/`: `interface.ts, types.ts, router.ts, liteparse-extractor.ts, normalizer.ts, zip-handler.ts, logger.ts` into `packages/pack-extraction/src/parse/extraction/`. Add a top comment “Vendored from packages/pipeline/src/extraction/<file> @ <commit> (no modifications planned)”.

Adapt logger import: `extraction/logger.ts` imports from `../lib/logger.js` in pipeline; point to `../../lib/logger.js` after vendoring pipeline’s `lib/logger.ts`.

Also vendor minimal:
- `packages/pipeline/src/lib/logger.ts` → `src/lib/logger.ts`
- `packages/pipeline/src/profile/types.ts`, `registry.ts`, `builtins/generic.ts` → `src/profile/`

## 4. Phase 1 — Types & adapter (PageContent → SourceModel)
- Extend `src/source-model/types.ts`: add optional `sourcePages?: number[]` on `SourceSection` (already referenced).
- Extend `src/ingest/types.ts`: `SourceManifest` becomes `{ id,title,format,filename,..., subject?, level?, language?, parser?, pages? }` (keep required fields; make backward compatible).
- Create `src/parse/index.ts`: `export async function parseToMarkdown(filePath:string, options?: ExtractionInput['options'])` that constructs router (`createDefaultRouter()`), registers `LiteParseExtractor`, handles .zip via `ZipHandler`, normalizes via `MarkdownNormalizer`, returns `{contentMd, manifest, assets}`.
- Create `src/parse/adapter.ts`: `export function toSourceDocumentModel(result: ExtractionResult, manifest?: Partial<SourceManifest>): SourceDocumentModel` 
  - parse contentMd into `SourceDocumentModel` via extended `parseMarkdown`
  - if `result.manifest`/pages known, map sections to page ranges (optional; don’t fail if absent)
- Keep `adapter.ts` (vendored) intact for reference; prefer `toSourceDocumentModel`.

## 5. Phase 2 — Multi-lesson segmentation + generic markdown parsing
Extend `src/source-model/normalize.ts`:
- `export function parseMarkdown(markdown:string, opts?: { lessonHeading?: RegExp|string[]|((t:string)=>boolean) }): SourceDocumentModel` 
  - preserve existing behavior when opts undefined (tests: 6 sections, document.id ‘’, types correct)
- Add `src/source-model/segment.ts`:
  - `export type LessonDoc = { doc: SourceDocumentModel; title: string }`
  - `export function segmentMarkdown(markdown:string, opts?: { lessonHeading?: RegExp|string } ): LessonDoc[]`
    - default: split on H1 lines that look like lesson titles (e.g. `^#\s+[A-Z][A-Z\s0-9(),.-]{3,}$` OR common NIOS patterns) — keep heuristic conservative; allow override via `--lesson-heading`
- Add `src/ingest/manifest.ts`: `deriveManifest(filePath:string, inferredTitle?:string): SourceManifest`

## 6. Phase 3 — CLI: accept any supported doc or md; multi-lesson; optional enrichment
Update `src/cli/index.ts` (preserve existing flags; add new ones):
New flags: `--parser liteparse|auto` (default liteparse), `--lesson-heading <regex>`, `--enrich`, `--llm-provider <openai|openrouter>`, `--llm-model <model>`, `--knowledge-pack-id`, `--curriculum-pack-id`, `--validate` (existing), `--help`
Behavior:
- if `--source` is .md/.markdown/.txt: read directly
- else: call `parseToMarkdown` (liteparse)
- if `segmentMarkdown` yields >1 lessons and user didn’t force single-doc behavior: for each lesson emit its own working dir under `--output/<lesson-doc-id>/`? Or emit under `manifest.id` with lesson subdirs? Keep backwards compatible: if single lesson, write to `join(output, manifest.id)` as today.
- but `extract:slice` uses the single-lesson fixture; tests expect `output/nios-math-level-a/` tree. So default: if 1 lesson → same path; if >1 → write `output/<manifest.id>/lessons/<slug>/…` (or emit per-lesson packs). Implement minimal: support multi-lesson by producing one working dir per lesson doc; e2e/slice unchanged.
- enrichment: if `--enrich`, dynamically import `@open-edu/pipeline-llm` (`const mod = await import('@open-edu/pipeline-llm')`) to build provider; write `review/enrichment.json` with `origin:'enriched'`; never write enriched concepts into packs when `derivedFrom==='document'` (explicit guard).

Also: if `--manifest` missing, derive via `deriveManifest`.

## 7. Phase 4 — Extraction tweaks for real docs (deterministic)
- `knowledge/extract.ts`: accept bullet `- ` in addition to `* ` for objectives (`line.startsWith('*') || line.startsWith('-')`); when parsing "Example N", be tolerant to `**Example 1:**` and `Example 1:`; collect glossary from prose if `**Term**` missing? Keep minimal: don’t invent terms. 
- `knowledge/glossary.ts`: regex already accepts `—` and `:`; leave.
- `source-model/normalize.ts`: `sectionTypeFor` — treat headings containing “learning objective”, “we will learn”, “objective” as objective; “exercise”, “let’s do”, “activity”, “assessment”, “example”, “note”. Case-insensitive (already). 
- `curriculum/extract.ts`: if multiple lessons, emit one unit per lesson (use lesson title/id). Keep single-unit behavior for slice.

## 8. Phase 5 — Tests, fixtures, build
- Keep all existing tests passing (don’t change expected shapes).
- Add `src/source-model/segment.test.ts` (multi-lesson split behavior; uses a small synthetic markdown or the liteparse’d head? avoid committing large PDF md; synthetic is fine).
- Add `src/parse/__tests__/md-passthrough.test.ts` (reads a temp .md → parseToMarkdown returns same contentMd or normalized? md passthrough in liteparse extractor exists; verify facade).
- Update root `package.json`: add `"extract": "pnpm --filter @open-edu/pack-extraction extract"` (optional). Keep `extract:slice`.
- `packages/pack-extraction/package.json`: add deps `"@open-edu/pipeline-llm": "workspace:*"`, `"@llamaindex/liteparse": "^2.8.0"`; keep bin `pack-extract`.
- Update tsconfig: include new dirs. Build with `pnpm build`.

## 9. Verification gates (must be green)
```bash
pnpm --filter @open-edu/pack-extraction build
pnpm --filter @open-edu/pack-extraction test
pnpm --filter @open-edu/pack-extraction typecheck
pnpm --filter @open-edu/pack-extraction lint
pnpm --filter @open-edu/pack-extraction exec prettier --check "src/**/*.{ts,tsx}"
pnpm extract:slice  # exit 0, tree matches
pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check  # root
```

## 10. Task breakdown (agent steps)
1. Vendor extraction utilities + logger/profile/minimal config (Phase 0)
2. Extend types, add parse facade + adapter (Phase 1)
3. Segmentation + generic parsing (Phase 2)
4. CLI updates (Phase 3)
5. Extraction tolerance tweaks (Phase 4)
6. Tests + package.json updates (Phase 5)
7. Run full verification

## 11. Notes
- Never write enriched data into packs when `derivedFrom==='document'`. Only `review/enrichment.json` and `review/human-review-flags.json` get enrichment markers.
- `validate/pack.ts`: if `--enrich` not used, behavior identical.
- Page provenance via `sourcePages` is best-effort; do not require it.
