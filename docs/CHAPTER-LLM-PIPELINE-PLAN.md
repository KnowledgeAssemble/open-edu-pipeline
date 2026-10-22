# Plan: Chapter-wise, LLM-assisted knowledge pack extraction from PDF (token-cost-effective)

Spec context: `docs/OPENEDU-KNOWLEDGE-EXTRACTION.md` (esp. §24 enrichment, §25 origin, §45 review stream), `docs/IMPLEMENTATION-PLAN.md` (thin slice), `docs/GENERIC-PIPELINE-PLAN.md` (generic parse/segmentation — landed). Constraint: do NOT modify `packages/pipeline/**` or `packages/pipeline-llm/**`.

Status: **plan only — no code yet.**

## Mission

Turn a real textbook PDF (pilot: NIOS Mathematics Level A) into validated knowledge + curriculum packs by combining deterministic parsing/segmentation with **LLM-assisted extraction at chapter scope**, at a token cost of well under $1 per full first run and ≈ $0 for re-runs.

Chosen approach (of three considered — chapter-map single-tier, chapter-map + escalation, page-window map-reduce): **chapter-map + escalation**. One **fast-tier** structured call per chapter; deterministic excerpt-grounded verification; escalate only demonstrably failed chapters to the **escalation tier** once; cross-chapter merge over compact JSON only. Tiers use pipeline-llm's `ModelTier` vocabulary (`fast` | `escalation`).

Why not page-window map-reduce: worse provenance (window, not section/page), more merge ambiguity, ~2–3× calls. Why not single-tier: failed messy chapters would need manual re-runs; escalation is a small retry-on-validation-failure mechanism.

## 1. Constraints

- No edits to `packages/pipeline/**` or `packages/pipeline-llm/**`; everything new lives in `packages/pack-extraction/src/**`.
- Backwards compatible: `pnpm extract:slice` **pack directories** (`packs/**`) byte-identical; all existing tests stay green. Additive files are allowed only under `review/` (e.g. `run-report.json`, `gaps.json`), and the single-chapter layout stays `output/<manifest.id>/` as today.
- Deterministic-first: deterministic extraction runs per chapter; in auto mode the LLM engages only when the deterministic result is **insufficient to satisfy the pack schema** (fewer than 1 concept OR fewer than 1 grounded objective), or when forced (`--llm`), or never (`--no-llm`).
- Provenance: every LLM item carries a verbatim excerpt grounded against the chapter text; packs stay `derivedFrom: "document"`.
- §24 pedagogical enrichment (misconceptions, bloom classification, pedagogy) is NOT in scope; it stays gated to `review/` via the existing `canMergeEnrichmentIntoPack` guard.
- No new runtime deps beyond what pack-extraction already declares (`@open-edu/pipeline-llm`, `@llamaindex/liteparse`, `zod`); `lit` on PATH for PDF sources (already documented).
- No live LLM calls in CI. Tests use a fake client and cache replay.

## 2. Stage architecture

Inter-stage data is JSON in the working directory — inspectable, resumable, cache-friendly.

```
Stage 0  deterministic    PDF → markdown (liteparse) + page map (form-feed split, best-effort)
Stage 1  deterministic    boilerplate strip + TOC-driven chapter segmentation → chapters.json
Stage 2  LLM, per chapter one structured call on the fast tier (auto/forced only)
Stage 3  deterministic    verify (zod) + excerpt-grounding + ids + provenance + curriculum assembly
Stage 4  LLM escalation   one retry on the escalation tier, only for chapters that failed Stage 3
Stage 5  LLM, compact     cross-chapter dedup + prerequisite links over compact JSON only
Stage 6  deterministic   merge apply + emit packs + validate + review stream + run report
```

### Stage → LLM mapping (pipeline-llm has a closed stage enum)

`@open-edu/pipeline-llm` exposes a fixed stage set (`LLM_STAGES`, 7 values) and must not be modified. Our logical stages therefore alias onto existing stages, and provider/model are overridden via `LlmRouter.updateStageConfig`. No new stage names are invented.

| Plan stage | `LlmStage` used | `ModelTier` |
| --- | --- | --- |
| Stage 2 extraction | `concept_map` | `fast` |
| Stage 4 escalation | `concept_enrichment` | `escalation` |
| Stage 5 merge | `review` | `fast` |

### Token usage caveat

`LlmProvider.generateStructured` returns only the parsed value (`T`); `StructuredResult` carries no token counts. Without modifying pipeline-llm (forbidden) we cannot read actual usage. **All cost figures in this plan — the budget guard and `run-report.json` — are estimates** (chars/4 × configured prices).

### What is reused vs new

- **Reused** from `@open-edu/pipeline-llm`: provider implementations (OpenAI/OpenRouter) and zod structured output (`zodResponseFormat`, plus OpenRouter's `json_object` fallback); `loadConfig`; `LlmRouter` + `updateStageConfig`; and the `ModelTier` (`fast` | `escalation`) + `LLM_FAST_MODEL` / `LLM_ESCALATION_MODEL` convention used for tier selection.
- **New here** (pipeline-llm has no such capability, and it must not be modified): retry/backoff, per-chapter response cache + resume, cost estimation / budget guard, escalation decision logic, chapter segmentation / orchestration / prompts, and the `LlmClient` test seam.
- Caveat: pipeline-llm ships two parallel LLM paths — `LlmRouter`/`LlmProvider` (what we use) and the AI-SDK `ModelFactory` where `ModelTier` is actually defined. We reuse the tier **vocabulary and env vars**, but drive calls through `LlmRouter`, so we cannot consume `ModelFactory` directly without switching abstraction.

## 3. Stage details

### Stage 1 — Chapter segmentation (deterministic)

Replaces the current all-caps-H1 heuristic for books (it mis-fires on the NIOS book, e.g. `READING UNDERSTANDING FORMINGAND`).

Order of strategies, first match wins:

1. `--toc-pages <range>` hint, else auto-detect TOC pages: pages whose content is a dense list of short numbered/titled lines (`> 60%` of lines match `^(UNIT|CHAPTER|LESSON)\b` or `^\d+[.:)]?\s+\S` with little prose between).
2. Heading patterns in body text: `^(UNIT|CHAPTER|MODULE|LESSON)\s+\w+` at any heading level, or repeated same-level headings with sequential numbers.
3. `--chapter-heading <regex>` explicit fallback.
4. If none match: single-document behavior (current slice path) — never a hard failure.

Path rule (backwards compat): a book always produces exactly one knowledge pack and one curriculum pack under `output/<manifest.id>/packs/`. Per-chapter intermediate artifacts live under `review/chapters/<chapterSlug>/`. A **single chapter that spans the whole document reproduces today's layout exactly** — same root, same pack ids, no `lessons/` or chapter subdirectories; only `review/` gains the additive files. Multi-chapter books keep the same root and pack shape, adding `review/chapters/<slug>/`.

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
  "objectives":    [ { "statement": "…",    "excerpt": "verbatim ≤ 600 chars", "conceptTerms": [ "…" ] } ],
  "examples":      [ { "term": "fraction", "excerpt": "verbatim ≤ 600 chars" } ],
  "prerequisites": [ { "fromTerm": "…",    "toTerm": "…", "excerpt": "verbatim ≤ 600 chars" } ]
}
```

Rules given to the model: excerpts MUST be copied verbatim from the chapter; do not invent terms; do not normalize spelling; no bloom/pedagogy; empty arrays are valid answers; one objective per stated objective bullet (nested bullets included — never merged, and a parent bullet with lettered sub-bullets states one objective per sub-bullet); at least one concept per numbered teaching section; each objective lists the `conceptTerms` it practises.

Notes:
- The adapter serves this logical stage from the pipeline-llm `concept_map` stage (see §2).
- The model is only asked for `term` / `summary` / `excerpt` / statements / prerequisite term pairs. Pack-required fields the model is not asked to produce (`domainTags`, objective `requiresIntents`, all ids) are injected deterministically in Stage 3. `domainTags` comes from `manifest.subject` (default `["mathematics"]`).
- `excerpt` has a hard cap of 2000 chars (`ConceptSourceSchema`); 600 is only the prompt-level target.
- **Output budget** — extraction and merge calls request a larger ceiling than the pipeline-llm stage default of 4 096 tokens (16 384 for extraction, 8 192 for the merge): a long chapter yields many concepts, and the escalation retry yields more, which overflows the default budget mid-JSON and loses the whole attempt.

### Stage 3 — Deterministic verification (the trust boundary)

For each item, in order:

1. **Zod parse** — schema-violating items rejected (reason: `schema`).
2. **Excerpt-grounding** — accept when `normalizeWs(excerpt)` is a substring of **either** `normalizeWs(chapterMarkdown)` **or** `normalizeWs(stripMarkdown(chapterMarkdown))`. `normalizeWs` collapses all whitespace (including form-feed `\f`) to single spaces and trims; `stripMarkdown` removes emphasis/heading/backtick/table/LaTeX markers (`*`, `_`, `` ` ``, leading `#`, `|`, `$`). Reject with reason `excerpt-not-found` only if neither matches. This is the hallucination filter; it costs zero tokens and tolerates markdown formatting differences.
3. **Ids** — concept id = `slugify(term)`; the first occurrence in book order wins the bare id. Later same-slug duplicates carry a temporary id `<chapterSlug>--<termSlug>` (hyphen-only, to respect the concept-id regex `^[a-z0-9][a-z0-9_-]*$`) until Stage 5 merges them. Any temp id Stage 5 leaves unresolved is finalized to a stable pack-legal id (`<chapterSlug>-<termSlug>`), recorded in `review/merge-map.json`, and **kept in the knowledge pack** — but excluded from curriculum-unit concept refs. No invalid or unresolved-duplicate id reaches emit, and no concept is silently dropped.
4. **Provenance** — `ConceptSourceSchema { documentId, section: chapter slug, page?, excerpt }` resolved deterministically from the excerpt's location in the page map. `page` is emitted only when it is a positive integer (schema requires `.positive()`); otherwise it is omitted. `section` is the reliable anchor; `page` is best-effort.
5. **Curriculum assembly** — one curriculum unit per chapter that has **≥1 grounded objective** (chapters with zero objectives are excluded — see Stage 4/6); objectives link ONLY to concepts grounded in the same chapter; `domainTags` injected from `manifest.subject`; `bloomLevel: "understand"`, `requiresIntents: ["understand"]` (deterministic defaults — classification is §24 territory). Objective `concepts` may be empty (schema default) when a chapter has objectives but no grounded concepts.
   **Objective links are scoped, not chapter-wide.** An objective links the concepts it practises: the `conceptTerms` the extraction named (resolved against the extracted concepts; unknown terms are dropped), else the concepts of the same teaching section, else a distinctive-word match (words that appear in many concept titles carry no signal and are ignored). Linking every chapter concept to every objective says nothing and is replaced by this rule.

Chapter health: `objectives ≥ 1` AND `< 30%` items rejected AND **coverage gates** (below). Unhealthy chapters go to Stage 4.

**Coverage gates (recall, not just precision).** Grounding proves every excerpt is real; it says nothing about what the extraction *missed*. Stage 3 therefore also measures, per chapter:

- **Stated objectives** — every bullet under a "We will learn …" / "Learning Objectives" heading, nested bullets included. The chapter is unhealthy when fewer objectives are extracted than the chapter states.
- **Objective granularity is structural, not only a prompt request** — a chapter states its objectives as bullets, often a parent bullet with nested sub-bullets, and a model that copies the whole block into one excerpt states several objectives in one. When an objective's excerpt spans more than one list item, Stage 3 splits it back into one objective per stated bullet (the bullet text becomes the statement and the excerpt; the model's own statement is dropped, since it cannot be attributed to a single bullet). The model's `conceptTerms` are spread over the split objectives by word overlap with the concept title, so each concept lands on the objective it belongs to.
- **Teaching sections** — numbered content sections (`1.1`, `2.10`). A section is covered when an accepted concept's excerpt comes from it (a fact inside a "Remember" box counts for the section that contains the box). The chapter is unhealthy when the covered share drops below 50%.
- **Lost sections** — a section whose only concept attempt was rejected. The chapter is unhealthy until that section carries a concept again.

The report is written to `review/chapters/<slug>/coverage.json` (and aggregated in `review/coverage-report.json`), so the coverage gap is visible in the artifact, not just implied by a rejection count.

### Stage 4 — Escalation (conditional, once)

Retry the whole chapter once on the escalation tier (served from the pipeline-llm `concept_enrichment` stage; see §2). Same Stage 3 verification. Still unhealthy → the chapter is recorded as `pending-human` under `review/chapters/<slug>/`, its grounded concepts are still kept in the knowledge pack, and the run continues. A pending-human chapter with zero grounded objectives is **excluded from curriculum units** (never emitted as a unit), because `CurriculumUnitSchema.objectives` requires ≥1.

**Escalation trigger.** A chapter escalates when the fast tier left anything on the table: a rejected item, a stated objective that was not extracted, an uncovered teaching section, or a section that lost its only concept. The escalation prompt repeats the verifier's rejection reasons and names the uncovered sections, so the retry has a concrete target. The retry replaces the fast attempt only when it extracted more (more concepts, then more objectives, then fewer rejections) — a weaker retry never throws away grounded content.

### Stage 5 — Cross-chapter merge (LLM, compact input only)

Input is never markdown — a compact JSON book summary: per concept `{ id, title, summary ≤ 200 chars, excerpt ≤ 300 chars, chapterId }`. The excerpt is the concept's verbatim source text: without it the model can only paraphrase, and a paraphrased `evidenceExcerpt` can never pass the grounding check, so every prerequisite link was dropped as `ungrounded-evidence`. Hard input cap ~50k tokens; if exceeded, merge per chapter-cluster then once across clusters (hierarchical, same schema — noted as future work if ever needed).

LLM returns: duplicate clusters (`{ canonicalId, duplicateIds }`) and cross-chapter prerequisite links (`{ fromId, toId, evidenceExcerpt }` — evidence is **required**, copied verbatim from the `excerpt` field of the `fromId`/`toId` concept).

Deterministic apply: merge clusters into canonical ids (provenance of the canonical = its first grounded excerpt; duplicates' excerpts recorded in `review/merge-map.json`); apply a prerequisite link only when its `evidenceExcerpt` passes the same excerpt-grounding check (§3 Stage 3 step 2) against one of the two chapters' text — **ungrounded links are dropped** to `review/unresolved-prereqs.json`. Unresolved or unknown-id references likewise go to `review/unresolved-prereqs.json`, never invented. This closes the gap where an invented-but-plausible link between two real ids would otherwise pass validation silently.

### Stage 6 — Emit + validate + report

Existing `emit/` writers and `validate/` checks (unique ids, prerequisite self-ref/cycle DFS, cross-pack concept-ref resolution) run unchanged, plus new rules: reject any concept whose provenance excerpt is not grounded (defense in depth); exclude unresolved/duplicate concept ids and zero-objective chapters from curriculum units; treat any `pending-human` chapter as non-success for exit status.

Emission guard: `CurriculumUnitSchema` requires ≥1 objective per unit and ≥1 unit per curriculum, so assembly never calls `CurriculumSchema.parse` with an empty unit. If no chapter yields a grounded objective, the curriculum pack is **not** emitted; the run writes the knowledge pack plus `review/gaps.json` (`no-curriculum-units`) and exits 1 — a clear diagnostic instead of a Zod throw.

## 4. Provenance & spec compliance

- LLM-assisted extraction is **extraction, not §24 enrichment**. Items are classified internally `origin: "source"` (excerpt carries the verbatim fact) or `"derived"` (normalized summary) — both pack-legal per spec §25.
- `origin` is extraction-internal and never written into `ConceptSchema` (`.strict()`); the pack-legal carrier is `ConceptSourceSchema`.
- Packs stay `derivedFrom: "document"` — legal because every concept carries real source provenance.
- Misconceptions stay empty; gaps recorded honestly in `review/gaps.json`. `--enrich` behavior and `canMergeEnrichmentIntoPack` are untouched.

## 5. Cost controls

1. **Chapter scope** — whole book never sent; boilerplate stripped first.
2. **Fast default tier** — extraction defaults to the `fast` `ModelTier` (mini/flash-class via openrouter, or `gpt-4o-mini`), resolved in `stage-config.ts` and honoring `LLM_FAST_MODEL`; `--fast-model`/`--provider` override it. The `escalation` tier is resolved the same way and honors `LLM_ESCALATION_MODEL` / `--escalation-model`.
3. **One call per chapter** — no conversation, temperature 0, structured output.
4. **Escalation only on demonstrated failure** — premium tokens never spent blanket.
5. **Compact merge** — Stage 5 sees summaries, not raw text.
6. **Resume cache** — key = `sha256(chapterMarkdown + promptVersion + model + schemaVersion)`; cached under `cache/llm/<stage>/<chapterId>.json` + `.meta.json { key, model, estimatedUsage, createdAt }`; unchanged chapters cost $0 on re-run; `--force` busts. Tradeoff: any prompt edit bumps `promptVersion` and re-extracts everything (documented).
7. **Budget guard (estimates only)** — `--max-budget-usd` (default 2.0). Because pipeline-llm surfaces no token usage, the guard uses **estimates**: price table (per-1M-token in/out, USD) in `stage-config.ts`, keyed by the configured model names. Before each call: `projected = spentEstimate + estimate(next)`, `estimate = tokensIn × priceIn + tokensOut × priceOut`, `tokens ≈ chars/4`. Exceeding → clean abort, partial state kept, resume free. Estimates are treated as conservative upper bounds.
8. **Observable spend (estimated)** — `review/run-report.json`: per-stage/per-chapter estimated tokens and cost, cache hits, escalations, rejections, pending-human list. Every figure is labeled an estimate, never presented as a billed amount.
9. **`--dry-run`** — chapter plan + per-chapter token estimates + total projected cost; zero calls.
10. **Explicit tier override** — `LlmRouter` reads provider/model from its own stage config, whose defaults are `gpt-5.4` / `gpt-5.4-mini`. The adapter must call `updateStageConfig` with the resolved `fast` model (and, on escalation, the `escalation` model) before any call so the fast default actually holds. Tiers follow pipeline-llm's `ModelTier` naming and env vars (`LLM_FAST_MODEL` / `LLM_ESCALATION_MODEL`), overridable via `--provider` / `--fast-model` / `--escalation-model`. Because the `ModelTier` helpers live on pipeline-llm's AI-SDK `ModelFactory` path (not the `LlmRouter` path we use), we reuse the naming/env convention rather than the factory itself.

Pilot math (NIOS Math Level A, ~25 chapters): ~4k in + ~1.5k out per chapter ≈ 140k tokens on a mini-class model → **under $0.50 first run**; re-runs ≈ $0.

## 6. CLI & working directory

`pack-extract` flags — existing ones unchanged; new:

| Flag | Meaning |
| --- | --- |
| `--llm` / `--no-llm` | force LLM for all chapters / forbid LLM. Default **auto**: LLM for any chapter whose deterministic result is insufficient for the pack schema — i.e. it has <1 concept OR <1 grounded objective (not merely "both zero") |
| `--provider`, `--fast-model`, `--escalation-model` | tier overrides; also honor `LLM_FAST_MODEL` / `LLM_ESCALATION_MODEL` |
| `--max-budget-usd <n>` | budget guard (default 2.0) |
| `--dry-run` | plan + cost estimate, no calls |
| `--force` | bust cache |
| `--chapters <slugs or ranges>` | subset re-run (e.g. `unit-3` or `unit-3..unit-5`) |
| `--toc-pages <range>`, `--chapter-heading <regex>` | segmentation hints/fallback |
| `--allow-partial` | treat `pending-human` chapters as warnings, not failure |

Working tree (under `output/<manifest.id>/`):

```
source/                     pdf + parsed markdown
source-model/               doc model + chapters.json
cache/llm/                  per-stage cached responses + .meta.json
review/                     merge-map.json, unresolved-prereqs.json, gaps.json,
                            human-review-flags.json, run-report.json
review/chapters/<slug>/     per-chapter rejections + health
packs/knowledge/<id>/ · packs/curriculum/<id>/    (existing shape)
```

Exit codes: `0` when the emitted packs validate, at least one curriculum unit exists, and there are no pending-human chapters (or `--allow-partial`); `1` otherwise — including a run whose curriculum pack could not be emitted because no curriculum units survived.

## 7. Error handling

- Provider/network failure → limited retries with backoff implemented in our orchestration, then Stage 4 escalation → `pending-human`; one chapter never kills the run. (pipeline-llm provides **no** retry; its OpenAI-SDK calls do still get the SDK's default transient retries.)
- Grounding rejection → item dropped, logged with excerpt + reason; never silently kept.
- Unresolved refs → review flags, never invented.
- Budget exceeded / interrupt → clean abort; completed chapters stay cached; resume is free.
- No API key in auto mode → deterministic path + `review/fidelity-report.json` stays `{"status": "pending-llm"}` (today's honest behavior).
- Zero-objective / fully-rejected chapters → excluded from curriculum units and logged under `review/chapters/<slug>/`; assembly never throws a Zod error.

## 8. Testing strategy (no live LLM in CI)

- **Injection seam**: `src/llm/client.ts` defines `LlmClient` (one structured-call method; the caller supplies its own char-based token estimate, since pipeline-llm returns no usage); `src/llm/pipeline-llm-client.ts` adapts `@open-edu/pipeline-llm`; `src/llm/fake.ts` is a deterministic fake for tests.
- **Cache replay e2e**: a synthetic 2-chapter markdown "book" fixture + committed recorded cache responses → golden e2e proving packs validate end-to-end without keys. Pin the exact model id in the fixture; temperature 0 is not a cross-model-version determinism guarantee, so the recording is the source of truth.
- **Unit tests**: TOC detection + segmentation fallbacks; grounding checker (verbatim accepted, markdown-formatted variant accepted, near-miss rejected); id/merge applier (duplicates merged, unresolved duplicates finalized and retained + excluded from curriculum); budget math (estimate-only — there is no usage API to assert against); cache key stability; auto-mode gating (deterministic-sufficient → no LLM call made); retry/backoff on transient failures; dry-run writes only `review/run-report.json`.
- **Existing tests untouched**; `extract:slice` pack output unchanged (`review/` gains only additive files).
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
5. Stage 4 escalation + budget guard + cost-estimate accounting.
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
pnpm extract:slice                                   # pack output unchanged
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
- **No token usage is available** from pipeline-llm (its provider returns only parsed data), so every cost figure — the budget guard and `run-report.json` — is an estimate (chars/4 × configured prices), not a billed amount. Price-table drift compounds this.
- `--chapters` subset re-runs still recompute the Stage 5 merge over the full concept set, so merge cost is not avoided (per-chapter extraction cost is).
- Chapter extraction is sequential; concurrency is a future optimization that would require reworking the budget guard.
- OCR-scan PDFs inherit liteparse's OCR warnings path; grounding still applies (OCR text is the source text).
- First-run cost projection is a chars/4 heuristic; `--dry-run` numbers are estimates, not guarantees.
