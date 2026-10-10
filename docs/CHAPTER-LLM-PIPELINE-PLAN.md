# Plan: Chapter-wise, LLM-assisted knowledge pack extraction from PDF (token-cost-effective)

Spec context: `docs/OPENEDU-KNOWLEDGE-EXTRACTION.md` (esp. §24 enrichment, §25 origin, §45 review stream), `docs/IMPLEMENTATION-PLAN.md` (thin slice), `docs/GENERIC-PIPELINE-PLAN.md` (generic parse/segmentation — landed). Constraint: do NOT modify `packages/pipeline/**` or `packages/pipeline-llm/**`.

Status: **plan only — no code yet.**

## Mission

Turn a real textbook PDF (pilot: NIOS Mathematics Level A) into validated knowledge + curriculum packs by combining deterministic parsing/segmentation with **LLM-assisted extraction at chapter scope**, at a token cost of well under $1 per full first run and ≈ $0 for re-runs.

Chosen approach (of three considered — chapter-map single-tier, chapter-map + escalation, page-window map-reduce): **chapter-map + escalation**. One cheap-tier structured call per chapter; deterministic excerpt-grounded verification; escalate only demonstrably failed chapters to a stronger model once; cross-chapter merge over compact JSON only.

Why not page-window map-reduce: worse provenance (window, not section/page), more merge ambiguity, ~2–3× calls. Why not single-tier: failed messy chapters would need manual re-runs; escalation is a small retry-on-validation-failure mechanism.

## 1. Constraints

- No edits to `packages/pipeline/**` or `packages/pipeline-llm/**`; everything new lives in `packages/pack-extraction/src/**`.
- Backwards compatible: `pnpm extract:slice` output tree byte-identical; all existing tests stay green.
- Deterministic-first: deterministic extraction runs per chapter; LLM engages only where it yields nothing (auto mode), or when forced (`--llm`), or never (`--no-llm`).
- Provenance: every LLM item carries a verbatim excerpt grounded against the chapter text; packs stay `derivedFrom: "document"`.
- §24 pedagogical enrichment (misconceptions, bloom classification, pedagogy) is NOT in scope; it stays gated to `review/` via the existing `canMergeEnrichmentIntoPack` guard.
- No new runtime deps beyond what pack-extraction already declares (`@open-edu/pipeline-llm`, `@llamaindex/liteparse`, `zod`); `lit` on PATH for PDF sources (already documented).
- No live LLM calls in CI. Tests use a fake client and cache replay.

## 2. Stage architecture

Inter-stage data is JSON in the working directory — inspectable, resumable, cache-friendly.

```
Stage 0  deterministic    PDF → markdown (liteparse) + page map (form-feed split, best-effort)
Stage 1  deterministic    boilerplate strip + TOC-driven chapter segmentation → chapters.json
Stage 2  LLM, per chapter one structured call on the cheap tier (auto/forced only)
Stage 3  deterministic    verify (zod) + excerpt-grounding + ids + provenance + curriculum assembly
Stage 4  LLM escalation   one retry on a stronger model, only for chapters that failed Stage 3
Stage 5  LLM, compact     cross-chapter dedup + prerequisite links over compact JSON only
Stage 6  deterministic   merge apply + emit packs + validate + review stream + run report
```

## 3. Stage details

### Stage 1 — Chapter segmentation (deterministic)

Replaces the current all-caps-H1 heuristic for books (it mis-fires on the NIOS book, e.g. `READING UNDERSTANDING FORMINGAND`).

Order of strategies, first match wins:

1. `--toc-pages <range>` hint, else auto-detect TOC pages: pages whose content is a dense list of short numbered/titled lines (`> 60%` of lines match `^(UNIT|CHAPTER|LESSON)\b` or `^\d+[.:)]?\s+\S` with little prose between).
2. Heading patterns in body text: `^(UNIT|CHAPTER|MODULE|LESSON)\s+\w+` at any heading level, or repeated same-level headings with sequential numbers.
3. `--chapter-heading <regex>` explicit fallback.
4. If none match: single-document behavior (current slice path) — never a hard failure.

Front matter (everything before the first chapter: cover, copyright, foreword) is excluded from LLM input but preserved under `source/`. Chapter markdown slices carry `pageStart`/`pageEnd` (best-effort from the form-feed page map) and `sha256`.

`source-model/chapters.json`:
```json
{ "chapters": [ { "id": "unit-1-numbers", "title": "UNIT 1: NUMBERS",
    "pageStart": 12, "pageEnd": 34, "sha256": "…", "markdown": "…" } ] }
```

### Stage 2 — Per-chapter extraction (LLM, one call)

Input: only that chapter's markdown. Temperature 0, structured output validated against a zod schema:

```json
{
  "concepts":      [ { "term": "fraction", "summary": "…", "excerpt": "verbatim ≤ 600 chars" } ],
  "objectives":    [ { "statement": "…",    "excerpt": "verbatim ≤ 600 chars" } ],
  "examples":      [ { "term": "fraction", "excerpt": "verbatim ≤ 600 chars" } ],
  "prerequisites": [ { "fromTerm": "…",    "toTerm": "…", "excerpt": "verbatim ≤ 600 chars" } ]
}
```

Rules given to the model: excerpts MUST be copied verbatim from the chapter; do not invent terms; do not normalize spelling; no bloom/pedagogy; empty arrays are valid answers.

### Stage 3 — Deterministic verification (the trust boundary)

For each item, in order:

1. **Zod parse** — schema-violating items rejected (reason: `schema`).
2. **Excerpt-grounding** — `normalizeWs(excerpt)` must be a substring of `normalizeWs(chapterMarkdown)` (whitespace-collapsed compare). Reject with reason `excerpt-not-found`. This is the hallucination filter; it costs zero tokens.
3. **Ids** — concept id = `slugify(term)`; first occurrence in book order wins the bare id; same-slug later duplicates are distinct concepts only when excerpts differ in meaning — resolution deferred to Stage 5 (temp id `<chapterSlug>/<termSlug>` until merged).
4. **Provenance** — `ConceptSourceSchema { documentId, section: chapter slug, page: best-effort, excerpt }` resolved deterministically from the excerpt's location in the page map.
5. **Curriculum assembly** — one curriculum unit per chapter; objectives link ONLY to concepts grounded in the same chapter; `bloomLevel: "understand"`, `requiresIntents: ["understand"]` (deterministic defaults — classification is §24 territory).

Chapter health: `objectives ≥ 1` AND `< 30%` items rejected. Unhealthy chapters go to Stage 4.

### Stage 4 — Escalation (conditional, once)

Retry the whole chapter once on `--escalation-model` (stronger tier). Same Stage 3 verification. Still unhealthy → chapter marked `pending-human` in `review/`, its grounded items still kept; run continues.

### Stage 5 — Cross-chapter merge (LLM, compact input only)

Input is never markdown — a compact JSON book summary: per concept `{ id, title, summary ≤ 200 chars, chapterId }`. Hard input cap ~50k tokens; if exceeded, merge per chapter-cluster then once across clusters (hierarchical, same schema — noted as future work if ever needed).

LLM returns: duplicate clusters (`{ canonicalId, duplicateIds }`) and cross-chapter prerequisite links (`{ fromId, toId, evidenceExcerpt? }`).

Deterministic apply: merge clusters into canonical ids (provenance of the canonical = its first grounded excerpt; duplicates' excerpts recorded in `review/merge-map.json`); apply prerequisite links; unresolved or cross-referencing-unknown ids → `review/unresolved-prereqs.json`, never invented.

### Stage 6 — Emit + validate + report

Existing `emit/` writers and `validate/` checks (unique ids, prerequisite self-ref/cycle DFS, cross-pack concept-ref resolution) run unchanged, plus new rules: reject any concept whose provenance excerpt is not grounded (defense in depth), reject `pending-human` chapters from counting as success.

## 4. Provenance & spec compliance

- LLM-assisted extraction is **extraction, not §24 enrichment**. Items are classified internally `origin: "source"` (excerpt carries the verbatim fact) or `"derived"` (normalized summary) — both pack-legal per spec §25.
- `origin` is extraction-internal and never written into `ConceptSchema` (`.strict()`); the pack-legal carrier is `ConceptSourceSchema`.
- Packs stay `derivedFrom: "document"` — legal because every concept carries real source provenance.
- Misconceptions stay empty; gaps recorded honestly in `review/gaps.json`. `--enrich` behavior and `canMergeEnrichmentIntoPack` are untouched.

## 5. Cost controls

1. **Chapter scope** — whole book never sent; boilerplate stripped first.
2. **Cheap default tier** — model per stage in `stage-config.ts` (mini/flash-class via openrouter, or `gpt-4o-mini`); `--model`/`--provider` override; separate `--escalation-model`.
3. **One call per chapter** — no conversation, temperature 0, structured output.
4. **Escalation only on demonstrated failure** — premium tokens never spent blanket.
5. **Compact merge** — Stage 5 sees summaries, not raw text.
6. **Resume cache** — key = `sha256(chapterMarkdown + promptVersion + model + schemaVersion)`; cached under `cache/llm/<stage>/<chapterId>.json` + `.meta.json { key, model, usage, createdAt }`; unchanged chapters cost $0 on re-run; `--force` busts. Tradeoff: any prompt edit bumps `promptVersion` and re-extracts everything (documented).
7. **Budget guard** — `--max-budget-usd` (default 2.0). Price table (per-1M-token in/out, USD) lives in `stage-config.ts`. Before each call: `projected = spent + estimate(next)`, `estimate = tokensIn × priceIn + tokensOut × priceOut` with `tokens ≈ chars/4`. Exceeding → clean abort, partial state kept, resume free.
8. **Observable spend** — `review/run-report.json`: per-stage/per-chapter tokens, est. cost, cache hits, escalations, rejections, pending-human list.
9. **`--dry-run`** — chapter plan + per-chapter token estimates + total projected cost; zero calls.

Pilot math (NIOS Math Level A, ~25 chapters): ~4k in + ~1.5k out per chapter ≈ 140k tokens on a mini-class model → **under $0.50 first run**; re-runs ≈ $0.

## 6. CLI & working directory

`pack-extract` flags — existing ones unchanged; new:

| Flag | Meaning |
| --- | --- |
| `--llm` / `--no-llm` | force LLM for all chapters / forbid LLM. Default **auto**: LLM only for chapters where deterministic extraction yields 0 concepts and 0 statements |
| `--provider`, `--model`, `--escalation-model` | tier overrides |
| `--max-budget-usd <n>` | budget guard (default 2.0) |
| `--dry-run` | plan + cost estimate, no calls |
| `--force` | bust cache |
| `--chapters <slugs or ranges>` | subset re-run (e.g. `unit-3` or `unit-3..unit-5`) |
| `--toc-pages <range>`, `--chapter-heading <regex>` | segmentation hints/fallback |
| `--allow-partial` | treat `pending-human` chapters as warnings, not failure |

Working tree (under `output/<manifest.id>/`):

```
source/            pdf + parsed markdown
source-model/      doc model + chapters.json
cache/llm/         per-stage cached responses + .meta.json
review/            per-chapter rejections, merge-map, unresolved-prereqs,
                   gaps, human-review-flags, run-report.json
packs/knowledge/<id>/ · packs/curriculum/<id>/    (existing shape)
```

Exit codes: `0` packs validate and no pending-human chapters (or `--allow-partial`); `1` otherwise.

## 7. Error handling

- Provider/network failure → retry with backoff (pipeline-llm) → Stage 4 escalation → `pending-human`; one chapter never kills the run.
- Grounding rejection → item dropped, logged with excerpt + reason; never silently kept.
- Unresolved refs → review flags, never invented.
- Budget exceeded / interrupt → clean abort; completed chapters stay cached; resume is free.
- No API key in auto mode → deterministic path + `review/fidelity-report.json` stays `{"status": "pending-llm"}` (today's honest behavior).

## 8. Testing strategy (no live LLM in CI)

- **Injection seam**: `src/llm/client.ts` defines `LlmClient` (one structured-call method + usage reporting); `src/llm/pipeline-llm-client.ts` adapts `@open-edu/pipeline-llm`; `src/llm/fake.ts` is a deterministic fake for tests.
- **Cache replay e2e**: a synthetic 2-chapter markdown "book" fixture + committed recorded cache responses → golden e2e proving packs validate end-to-end without keys.
- **Unit tests**: TOC detection + segmentation fallbacks; grounding checker (verbatim accepted, near-miss rejected); id/merge applier; budget math; cache key stability; auto-mode gating (deterministic-sufficient → no LLM call made).
- **Existing tests untouched**; `extract:slice` tree unchanged.
- **Real-book run**: manual checklist in this doc (below), not CI.

## 9. Package layout (new code, all inside pack-extraction)

```
src/llm/         client.ts, pipeline-llm-client.ts, fake.ts (test-only export)
src/chapters/    toc.ts, segment.ts, types.ts
src/stages/      extract.ts (prompt + response zod schema), verify.ts (grounding),
                 escalate.ts, merge.ts, budget.ts
src/cache/       key.ts, store.ts
src/run/         orchestrate.ts, report.ts
```

CLI wiring in `src/cli/index.ts`; `src/enrich/` untouched.

## 10. Task breakdown

1. Chapter segmentation: TOC detect + heading fallbacks + `chapters.json` (deterministic, fully unit-tested).
2. LLM seam: `LlmClient` interface + pipeline-llm adapter + fake; stage-config tiers + price table.
3. Cache store + key (hash, versions, `.meta.json`).
4. Stage 2 prompt + response schema; Stage 3 verifier (grounding, ids, provenance, curriculum assembly).
5. Stage 4 escalation + budget guard + usage accounting.
6. Stage 5 compact merge + deterministic apply + unresolved flags.
7. Auto/`--llm`/`--no-llm` gating + CLI flags + working-dir layout + run-report + dry-run.
8. Tests: units + cache-replay golden e2e + synthetic fixtures.
9. Full verification gates + manual real-book run checklist.

## 11. Verification gates (must be green)

```bash
pnpm --filter @open-edu/pack-extraction build
pnpm --filter @open-edu/pack-extraction test
pnpm --filter @open-edu/pack-extraction typecheck
pnpm --filter @open-edu/pack-extraction lint
pnpm extract:slice                                   # unchanged tree
pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
```

Manual (not CI), with a real key:

```bash
node packages/pack-extraction/dist/cli/index.js \
  --source pdf/Math_Level_A_english_medium.pdf \
  --manifest pdf/manifest.json --output output \
  --knowledge-pack-id nios-math-a-knowledge \
  --curriculum-pack-id nios-math-a-curriculum \
  --dry-run --validate        # inspect plan + cost estimate
# then the same without --dry-run; expect exit 0 and run-report under ~$0.50
```

## 12. Honest limitations

- Page provenance is best-effort (liteparse form-feed map); sections are the reliable anchor, pages are not guaranteed.
- Any prompt edit bumps `promptVersion` → full re-extraction cost (the cache is prompt-exact).
- Stage 5 input cap ~50k tokens; hierarchical merge is future work if a book ever exceeds it.
- Misconceptions, bloom levels, pedagogical links: out of scope (§24) — packs stay honest about the gap.
- Price-table drift: estimates are only as accurate as the configured prices; `run-report.json` records actual usage.
- OCR-scan PDFs inherit liteparse's OCR warnings path; grounding still applies (OCR text is the source text).
- First-run cost projection is a chars/4 heuristic; `--dry-run` numbers are estimates, not guarantees.
