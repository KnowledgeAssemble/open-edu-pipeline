# Implementation Plan: LLM Proofreading of LitParse Markdown (using deepseek4-flash)

## Context
- Repo: `/Users/sarthakpatnaik/Code/open-edu-pipeline`
- Target: `@open-edu/pack-extraction` package
- Design doc: `docs/MARKDOWN-PROOFREADING-PLAN.md` (source of truth)
- Model: `deepseek4-flash` (vision-capable)
- Constraints: do not modify `packages/pipeline/**`, `packages/pipeline-llm/**`. Existing LLM seam has no multimodal support.

## Overview
Implement standalone `proofread-md` CLI and `pack-extract --proofread` pre-stage. Patch-based corrections, verify-before-apply, page mapping for PDFs, no-PDF mode (PARTIAL), provenance/caching, shared budget.

## Package layout
Create `src/proofread/`: `types.ts`, `reference.ts`, `align.ts`, `window.ts`, `prompt.ts`, `client.ts`, `http-client.ts`, `fake.ts`, `checks.ts`, `detect.ts`, `patch.ts`, `verify.ts`, `orchestrate.ts`, `report.ts`, `cli.ts`, `__tests__/`

Modify: `package.json` (add bin), `src/cli/index.ts`, `src/run/orchestrate.ts` (minimal), `README.md`

## Phases
### Phase 0: Types & schemas
Zod schemas for issues/patches/page review/status/report. Versions/constants. Status precedence.

### Phase 1: Reference builder
Use LiteParse API (`parse`, `screenshot`). Mirror options. Provenance manifest. Routing (vision if material signals; bare `|` not enough). Oversized image DPI reduction. No-PDF -> skip.

### Phase 2: Page alignment
Anchor-based alignment, confidence, page-map.json (`available` flag). Pilot gate logic.

### Phase 3: Deterministic checks
Headings/hierarchy, syntax, duplicates, encoding, arithmetic (literals only, never fix), assets.

### Phase 4: Windows/prompts/client
Windowing rules, versioned prompts with untrusted fencing, ProofreadClient interface, http-client for deepseek4-flash (vision), fake client, schema retry.

### Phase 5: Detection/patching/verification
Page assignment from map, dedup, anchor resolution (exact+context), ordering, size limits, reconstruction, verify-before-apply, independent verifier for high-risk, changed-page re-review, full scan.

### Phase 6: Orchestration
runProofread flow, budget (sub-cap + global), cache keys, dry-run, status precedence, partial fallback.

### Phase 7: CLI + integration
proofread-md CLI, pack-extract flags/pre-stage/stage-aware dry-run, both downstream paths, multi-lesson handling, partial fallback.

### Phase 8: Tests/eval
Unit+integration per design, pilot eval against classified corrected_markdown.md.

## Key details
- deepseek4-flash via OpenAI-compatible endpoint; send images as base64
- Verify-before-apply (candidates verified, then applied)
- No-PDF: page-map unavailable, pages omitted, markers refused, source-fidelity patches not auto-applied, status PARTIAL
- Page markers: opt-in, safe boundaries, recorded as page-map patches, strip existing markers as delete patches
- Budget: shared ledger; proofreading cannot exceed global cap
- Cache: reference/review/verification with full keys
- Reconstruction: proofread.md = raw.md + applied patches

## Validation
pnpm --filter @open-edu/pack-extraction build
pnpm --filter @open-edu/pack-extraction test
pnpm --filter @open-edu/pack-extraction typecheck
pnpm --filter @open-edu/pack-extraction lint
pnpm extract:slice
