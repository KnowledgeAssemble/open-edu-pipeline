# Design: LLM Proofreading of LitParse Markdown against the Source PDF

Status: **design only — no code yet.**

Context:

- PDF → Markdown is done by `@llamaindex/liteparse` (`packages/pack-extraction/src/parse/extraction/liteparse-extractor.ts`).
- Chapter segmentation, LLM extraction, and review artifacts already live in `packages/pack-extraction`.
- `review/fidelity-report.json` is currently only a marker (`pending-llm` / `llm-assisted`); nothing
  compares the Markdown against the PDF.
- `pdf/Math_Level_A_english_medium.md` is the raw parse; `pdf/corrected_markdown.md` is a manual
  correction of the same book. It is useful as a classified evaluation diff, not as ground truth.
- LitParse Markdown currently has **no page markers** (no form feeds). `chapters.json` therefore has
  no `pageStart`/`pageEnd`. Page alignment must be established explicitly before page-scoped review.
- `@llamaindex/liteparse` exposes the APIs we need without new dependencies:
  `LiteParse.parse()` (per-page text + layout complexity), `LiteParse.isComplex()`, and
  `LiteParse.screenshot()` (PNG per page). These are used only by the proofreader.
- LitParse per-page text is derived by the same converter family as the Markdown. It is a useful
  cross-check for prose, but it is not independent ground truth. Only page images can verify what
  the PDF actually shows.

Goal: produce a **faithful, auditable** proofread Markdown plus a report, correcting only
PDF-supported conversion errors. Accuracy over fluency. The raw LitParse output is never overwritten.

---

## 1. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Integration | Standalone `proofread-md` CLI **and** optional `pack-extract --proofread` pre-stage | Usable on existing Markdown, and runnable inside both the legacy and chapter pipelines |
| Source of truth | PDF page screenshots for visual pages; LitParse per-page text as a derived cross-check for prose pages | Screenshots verify the PDF visually; the text layer alone can repeat converter errors |
| LLM task | Detect and propose **patches**, not rewrite the document | Bounded cost, auditable, safe to apply |
| Auto-apply | Only `CONVERSION_ERROR`, `high` confidence, context-resolved anchor, deterministically grounded evidence, independent verification, under size limits | Matches “only correct confirmed conversion errors automatically” |
| Missing/duplicated content | Auto-apply only short, context-resolved inserts/deletes; otherwise flag | Prevents reconstructing large sections from model memory |
| Page mapping | Align raw Markdown to LitParse `pages[]` via anchors; store `page-map.json` | Markdown has no page breaks; page numbers must not be invented |
| Page markers | Off by default; if enabled, recorded as page-map patches and inserted only at safe block boundaries | Keeps `raw.md + patches.json` reproducible and avoids breaking Markdown structure |
| Second pass | Verify every candidate patch against the PDF before applying; re-review changed pages; deterministic full scan | Verifies corrections without doubling the cost of every page |
| Default in pipeline | Proofreading **off**; when enabled, mode `apply` | Backwards compatible (`pnpm extract:slice` unchanged) |
| Status | `PASS`, `PASS_WITH_WARNINGS`, `NEEDS_REVIEW`, `PARTIAL`, with explicit precedence | Honest about what was and was not inspected |

### Approaches considered

1. **Whole-document rewrite** — send the PDF and Markdown, ask for a corrected document.
   Rejected: unbounded output, high hallucination risk, non-auditable, expensive on a book, and it
   encourages prose rewriting.
2. **Page-window issue detection + deterministic patch application + verification** (chosen).
   Map/reduce over pages, structured issues, exact anchors, minimal patches, evidence-backed.
3. **Two-model consensus per page** — independent reviewers vote per issue.
   Rejected as the default: roughly doubles cost. The verification pass instead checks every
   candidate patch, using a different model/provider only for high-risk categories.

---

## 2. Pipeline placement

```text
PDF ──lit parse──► raw Markdown ───────────────────────────────┐
 │                    │                                        │
 │                    └──► page aligner ──► page-map.json     │
 │                                                             │
 └──► reference builder ──► page text + complexity + PNGs      │
                              │                                │
                              ▼                                │
                    per-window LLM detection ──► issues.json   │
                               │                                │
                               ▼                                │
                    patch candidate verification ──► accepted   │
                               │                                │
                               ▼                                │
                    deterministic patch applier ──► patches.json
                               │                                │
                               ▼                                │
          changed-page re-review + full scan ──► proofread.md + report
                               │                                │
                               ▼                                │
       legacy or chapter segmentation + extraction use selected Markdown
```

### Stage 0.5 in `pack-extract`

Proofreading is a **pre-stage in `run()`**, not a branch that replaces the chapter pipeline. It runs
after `readSource()` and before either downstream path:

1. `runProofread()` reads the raw Markdown and returns a `ProofreadResult` containing the raw
   Markdown, the proofread Markdown, the selected status, and artifact paths.
2. The selected Markdown is passed to **both** downstream paths: `orchestrate()` for chapter
   extraction and `emitLesson()` for the legacy lesson path.
3. `--proofread` never selects the chapter pipeline by itself. Chapter extraction is still selected
   only by the existing manifest/LLM/explicit flags. This lets `pack-extract --source book.md
   --proofread` proofread a Markdown source without unexpectedly running chapter extraction.
4. With `--proofread-mode apply` (default), `PASS`, `PASS_WITH_WARNINGS`, and `NEEDS_REVIEW` use the
   proofread Markdown. `PARTIAL` always falls back to the raw Markdown in v1; partial patches remain
   review-only. With `--proofread-mode report`, downstream always uses raw Markdown.
5. The raw Markdown remains available under the existing `source/` path(s); the proofread Markdown
   is written at the whole-document artifact root (`output/<manifest.id>/source/`).

For legacy multi-lesson sources, proofreading happens on the whole selected document before
`segmentMarkdown()`. Whole-document proofread artifacts live at `output/<manifest.id>/`; each
generated lesson keeps its existing `source/` layout, uses the corresponding proofread slice, and
does not duplicate the whole-document report or cache.

`--dry-run` is stage-aware. When `--proofread` is present, it writes the proofreading dry-run
artifacts and makes no proofreading calls. If chapter extraction is also selected, the existing
chapter dry-run artifacts are written too. When `--proofread` is absent, `--dry-run` keeps its
current chapter-pipeline behavior.

Implementation note: `run()` currently treats `--dry-run` itself as a chapter selector. In
proofread-only mode, `--dry-run` must not select the chapter pipeline; it selects chapter extraction
only when another chapter selector (`--chapters`, `--toc-pages`, `--chapter-heading`, `--llm`,
`--force`) or the existing `autoChapter` condition is present.

### Standalone command

```bash
proofread-md \
  --pdf ./pdf/Math_Level_A_english_medium.pdf \
  --markdown ./pdf/Math_Level_A_english_medium.md \
  --output ./output/nios-math-level-a \
  --mode apply
```

A new bin in `packages/pack-extraction/package.json`:

```json
"bin": {
  "pack-extract": "./dist/cli/index.js",
  "proofread-md": "./dist/proofread/cli.js"
}
```

The command calls the same `runProofread()` library entry point as the embedded stage. Standalone
uses `--mode`, `--pdf`, and `--markdown`; embedded uses `--proofread-mode` and `--proofread-pdf`.
Both CLIs share one option parser and accept the other spelling as an alias, so the option name is
never ambiguous.

---

## 3. Inputs and reference model

### Input resolution

| Invocation | PDF reference | Markdown under review | Result |
| --- | --- | --- | --- |
| `--source book.pdf` | `book.pdf` | LitParse output | Full review |
| `--source book.md --proofread-pdf book.pdf` | `book.pdf` | `book.md` | Full review |
| `--source book.md` | none | `book.md` | Structural/text-only review; status is `PARTIAL` |

Use `--proofread-pdf` when the source is Markdown and the original PDF exists. The CLI cannot know
whether a PDF “exists” unless it is supplied, so omitting it means text-only review, not an inferred
PDF lookup. This matches the current repository workflow, where the pipeline is often pointed at a
pre-parsed `.md`.

If no PDF is available, the agent prompt's fallback applies: inspect structure and text, state
clearly that source accuracy could not be verified, and cap the status at `PARTIAL`.

### Page reference bundle

When a PDF is available, build for each page:

```ts
interface PageReference {
  pageNum: number; // LitParse ParsedPage.pageNum (1-based)
  kind: 'text' | 'vision';
  text: string; // LitParse page.text (native text layer or OCR); derived, not ground truth
  pageMarkdown: string; // LitParse page.markdown, used for alignment only
  complexity?: PageComplexityStats; // pageNumber, needsOcr, layout, tables, figures
  screenshotPath?: string; // PNG when kind === 'vision'
  quality: {
    chars: number;
    replacementChars: number;
  };
}
```

Reference construction uses the LitParse API:

- `new LiteParse({ outputFormat: 'json', includeComplexity: true, ... }).parse(pdf)`
  gives `pages[]` with `pageNum`, `text`, `markdown`, and layout signals.
- `new LiteParse({ dpi }).screenshot(pdf, pageNumbers)` gives PNG buffers for visual pages.
- Every extraction-affecting setting is mirrored, not only OCR: `ocrEnabled`, `ocrLanguage`,
  `ocrServerUrl`, `tessdataPath`, `dpi`, `imageMode`, `extractImages`, `targetPages`, `maxPages`,
  `keepHeadersFooters`, `preserveVerySmallText`, `extractLinks`, and page-crop options. A mismatch
  in any of these can change page Markdown and invalidate alignment.

### Reference provenance

The raw Markdown is produced by the `lit` CLI while the proofreader uses the API. They can drift by
version or option. The reference builder therefore writes
`cache/proofread/reference/manifest.json`:

```json
{
  "pdfSha256": "…",
  "rawMarkdownSha256": "…",
  "liteparseVersion": "2.11.0",
  "parseOptions": {},
  "parseOptionsSha256": "…",
  "screenshotDpi": 150,
  "createdAt": "…"
}
```

Rules:

- Include `liteparseVersion` and every effective parse option in the reference cache key.
- If the raw Markdown has no recorded provenance (the current `pdf/manifest.json` is an example),
  record `liteparseVersion: "unknown"` and set `referenceMismatch: true`.
- A reference mismatch does **not** block alignment, but it caps the status at `NEEDS_REVIEW`
  unless a deep per-page diff shows the reference and raw Markdown are equivalent. If alignment
  coverage falls below the pilot threshold, the status becomes `PARTIAL`.
- The current extractor shells out to `lit`, which is not on `PATH` in every environment. The
  proofreader must not assume CLI/API equivalence; the provenance manifest and the alignment spike
  below are the guardrails.

This is a second parse pass. It is cached by
`sha256(pdf bytes + liteparseVersion + parse options + screenshot dpi)` under
`cache/proofread/reference/`, so re-runs and page-window retries reuse it. A future refactor can make
extraction single-pass by exposing `pages[]` from the extractor; that is not required for this
design.

### Page routing

`--proofread-reference auto` (default) chooses per page:

Use **vision** when any material visual signal is present:

- the complexity stats report an OCR need or a full-page image;
- `complexity.layout?.isComplex`;
- table or figure layout counts are nonzero;
- the page Markdown contains an image (`![`), display math (`$$`, `\begin`, `\[`), or fewer than
  ~200 text characters;
- the page's text layer contains replacement characters or garbled markers.

A bare `|` is not sufficient to route a prose page to vision; it may be an inline pipe, a
single-cell aside, or a malformed line. Tables are routed through the layout counts, or through a
minimum row/column shape check. This keeps incidental pipes from multiplying vision cost.

Otherwise use **text**. Text-only mode on a visual page records a `UNVERIFIABLE`/manual-inspection
note, cannot yield `PASS`, and resolves to `NEEDS_REVIEW` (or `PARTIAL` if the required image could
not be obtained).

Routing is validated by the cost/routing spike in §11 before defaults are accepted. The spike must
report the vision-page ratio, image-token estimate, projected full-book cost, and the projected
cost after verification.

### Page alignment

Because LitParse Markdown has no page breaks:

1. For each page, take the first and last non-empty blocks from `page.markdown`.
2. Locate those anchors in the raw Markdown. Prefer exact match; then a normalized-whitespace
   match; then a token-level diff around the expected offset.
3. Establish page start/end line ranges. Adjacent ranges must be monotonic and non-overlapping.
4. Confidence is `high` for exact unique anchors, `medium` for fuzzy matches, `low` otherwise.
5. Any page that cannot be aligned is marked `unaligned`; its content is not patched. If the
   unaligned page contains content, the run status becomes `PARTIAL`, because that page could not
   be inspected page-scoped.

**Pilot gate before implementation:** run the aligner on the 131-page NIOS book. If fewer than 95%
of pages align at `high` or `medium`, or fewer than 90% at `high`, stop and revise the aligner
before building the LLM and patch stages. Record the measured coverage in the design review.

Output `review/proofread/page-map.json`:

```json
{
  "available": true,
  "pdfSha256": "…",
  "rawMarkdownSha256": "…",
  "liteparseVersion": "2.11.0",
  "pages": [
    {
      "pageNum": 12,
      "startLine": 241,
      "endLine": 289,
      "confidence": "high",
      "method": "exact-anchor",
      "referenceKind": "vision"
    }
  ],
  "unaligned": [37],
  "markerSkipped": []
}
```

Page numbers in issues come only from this map. No page number is inferred from the printed page
number in the document. Optional page markers are derived from this map and are recorded as patches;
they are never the source of page numbers.

Without a PDF there is no page map. Write `page-map.json` with `available: false`, empty `pages` and
`unaligned` arrays, and no markers. Page-scoped review, page markers, and page-based issue assignment
are disabled; those issues are located by line/heading only.

### Page markers in the output

Page markers are **off by default** and opt-in via `--proofread-page-markers`. They are always off
in `report` mode. When enabled:

- Insert `<!-- pdf-page: N -->` only at a safe block boundary: immediately before a heading,
  paragraph, list, table, or fenced-block start.
- Never insert inside a paragraph, table, list item, fenced code block, or math block. If a page
  starts mid-block, skip the marker for that page and record `markerSkipped` in `page-map.json`.
- Only insert for pages whose alignment confidence is `high` or `medium`.
- Record every marker as a synthetic `insert-before` patch with `origin: 'page-map'` in
  `patches.json`. Page-map marker patches and LLM patches are resolved against the raw Markdown and
  applied in the same descending-line pass; a marker at the same line as a content patch is
  ordered before the content patch.

Markers are provenance for humans and reports, **not** the pagination source. `splitPages()` in
`packages/pack-extraction/src/chapters/toc.ts` only recognizes form feeds, so chapter
`pageStart`/`pageEnd` remain undefined unless a future page-aware segmenter reads `page-map.json`.
This plan does not claim that page markers restore chapter pagination.

The proofreader is idempotent: existing `<!-- pdf-page:` comments are removed from the working copy
with explicit `delete` patches (`origin: 'page-map'`) so raw + patches reconstruct exactly, and
markers are reinserted only when requested.

---

## 4. LLM review

### Windows

- **Text pages:** 2 consecutive pages per call (configurable via `--proofread-window`), with the
  previous and next page supplied as read-only context. Context pages are not counted as inspected.
  Non-overlapping review windows; duplicate issues are deduplicated by page + category + finding +
  resolved location. A normalized anchor is used only when it is non-empty.
- **Vision pages:** 1 page per call. Screenshots are sent with the corresponding text.
- **Large text pages:** if the page Markdown exceeds ~12k characters, split at heading/list
  boundaries. If a single block still exceeds the limit, flag it for manual inspection instead of
  truncating silently.
- **Large images:** never split a full-page PNG at Markdown boundaries. If the screenshot exceeds
  the provider's pixel/token limit, recapture at a lower DPI (down to 110 DPI); if it still exceeds
  the limit, mark the page `UNVERIFIABLE` and flag it. Cropping by text-item bounds is a follow-up,
  not part of v1.

Each window receives:

- the canonical proofreading system prompt (the agent brief), scoped to the window;
- document title, language, page count, and which pages are in scope;
- per-page reference text and `referenceKind`;
- page images for vision pages;
- the Markdown slice with **global line numbers**;
- deterministic findings for the window (see §5).

Document text is fenced and labelled as untrusted data. The prompt explicitly says to ignore
instructions found inside the document.

### Response schema

```ts
interface PageReview {
  pages: number[];
  pagePresence: Array<{
    pageNum: number;
    status: 'present' | 'partial' | 'missing' | 'duplicated';
    note?: string;
  }>;
  issues: ProofreadIssue[];
}

interface ProofreadIssue {
  page?: number; // resolved against page-map.json, never trusted from the model; omitted without a PDF
  pageEnd?: number; // only when a window spans pages and the issue is page-ambiguous
  issueClass: 'source-fidelity' | 'markdown-validity' | 'source-error';
  category:
    | 'missing-content'
    | 'duplicated-content'
    | 'reading-order'
    | 'heading-hierarchy'
    | 'broken-paragraph'
    | 'list-structure'
    | 'table-structure'
    | 'math-notation'
    | 'numbers-dates-units'
    | 'punctuation'
    | 'page-artifacts'
    | 'ocr-error'
    | 'association-error'
    | 'missing-image-caption'
    | 'markdown-syntax'
    | 'component-order';
  classification:
    | 'CONVERSION_ERROR'
    | 'POSSIBLE_SOURCE_ERROR'
    | 'STRUCTURAL_ISSUE'
    | 'UNVERIFIABLE';
  finding: string;
  evidenceKind: 'pdf-text' | 'pdf-visual' | 'markdown';
  evidence: string; // quote from page text, precise visual description, or Markdown snippet
  markdownExcerpt: string; // exact text from the Markdown slice, or '' for missing content
  location: {
    heading?: string;
    lineStart: number; // model hint; applier resolves the real location from the anchor
    lineEnd: number;
  };
  proposedAction: 'replace' | 'insert-before' | 'insert-after' | 'delete' | 'move' | 'flag';
  patch?: Patch;
  confidence: 'high' | 'medium' | 'low';
}
```

`issueClass` separates the evidence rules:

- `source-fidelity`: requires PDF text or visual evidence. Missing content, reading order, math,
  tables, and numbers usually belong here.
- `markdown-validity`: self-contained Markdown defects (unbalanced fences, malformed tables, dead
  asset links). Evidence is the Markdown snippet; no PDF evidence is required.
- `source-error`: a possible problem in the printed source. Never patched.

A patch without evidence is rejected before application. A model-supplied `page` is ignored; the
orchestrator assigns the page from `page-map.json` after resolving the issue location. If an issue
cannot be assigned to exactly one page, it is reported as `UNVERIFIABLE` and is never auto-applied.
Without a PDF, `page`/`pageEnd` are omitted and the issue is located by its heading and line range;
no source-fidelity patch can be auto-applied in that mode.

### Patch format

Patches use exact text anchors rather than trusting model-supplied line numbers:

```ts
interface PatchBase {
  exact: string;
  before: string;
  after: string;
  origin: 'llm' | 'page-map'; // page-map patches are deterministic marker insert/delete patches
  order?: number; // assigned by the applier; page-map markers sort before LLM patches
}

type Patch =
  | (PatchBase & { op: 'replace'; replacement: string })
  | (PatchBase & { op: 'insert-before'; text: string })
  | (PatchBase & { op: 'insert-after'; text: string })
  | (PatchBase & { op: 'delete' });
```

Rules enforced by the applier:

- `exact` must occur verbatim at least once in the raw Markdown. It does **not** need to be globally
  unique.
- All occurrences of `exact` are resolved; `before`/`after` context must select exactly one. If the
  context still leaves zero or multiple matches, the patch is rejected. This allows repeated common
  text (for example, repeated exercise lines) to be patched safely without requiring global
  uniqueness.
- Context matching is normalized for line endings and trailing whitespace, but not for word changes.
- Patches are applied in descending line order with offset tracking; overlapping patches are
  rejected. Multiple inserts at the same line are applied in ascending `order`, with `page-map`
  markers first.
- Maximum auto-applied patch size: 2 000 characters and 40 lines. Larger changes are flagged.
- `move` is never auto-applied in v1; it is reported as `STRUCTURAL_ISSUE`.
- A patch attached to `POSSIBLE_SOURCE_ERROR` or `UNVERIFIABLE` is stripped and the issue is
  flagged; it must not invalidate the rest of the response.
- A patch whose `issueClass` is `markdown-validity` is never auto-applied; deterministic checks flag
  it for review.

Every applied or rejected patch, including page-map markers, is recorded in `patches.json` with the
reason and its order. `proofread.md` is reproducible as `raw.md + patches.json`.

### Prompt and evidence versioning

`PROOFREAD_PROMPT_VERSION`, `PROOFREAD_VERIFIER_PROMPT_VERSION`, and
`PROOFREAD_SCHEMA_VERSION` are stored with every cache entry and in the report. Any prompt change
invalidates the proofreading cache, exactly like the chapter pipeline. The verifier has its own
version so detection and verification can be changed independently.

---

## 5. Deterministic checks (zero tokens)

These run before the LLM and again after patching. They produce Markdown-validity findings,
source-fidelity candidates, and deterministic validations of the final document.

| Check | What it finds | Evidence class | Auto-fix? |
| --- | --- | --- | --- |
| Page coverage | A page's anchors/content are absent from Markdown; content repeated across pages | source-fidelity | No; produces `missing-content` / `duplicated-content` candidates |
| Heading hierarchy | Skipped heading levels; heading nesting inconsistent | markdown-validity | No; flags only |
| Heading content | Heading text missing or out of order | source-fidelity | No; LLM must confirm with PDF evidence |
| Page artifacts | Running headers, footers, and page numbers repeated across pages | source-fidelity | No; flags for review |
| Markdown syntax | Unbalanced fences, malformed tables, unclosed `$`/`$$`, broken lists | markdown-validity | No; flags |
| Duplicate blocks | Normalised paragraph hashes repeated on the same page or adjacent pages | source-fidelity | No; flags |
| Encoding/OCR | U+FFFD, control characters, mojibake, known OCR substitutions | source-fidelity or markdown-validity | No; flags |
| Arithmetic | Simple `a op b = c` expressions whose result is wrong | source-error | **Never**; classified `POSSIBLE_SOURCE_ERROR` |
| Asset references | `![...](assets/...)` targets missing from the asset set; caption adjacency | markdown-validity | No; flags |

The arithmetic checker only handles literal integer/decimal expressions and skips variables,
units, and formatting it cannot parse. It must not “correct” the source; it reports a possible
source error and leaves the text unchanged.

Deterministic findings are passed into the LLM window as hints, not as conclusions. Source-fidelity
issues require PDF evidence before they can be auto-applied. Markdown-validity issues are complete
from the Markdown alone and can be reported without a PDF; they are never auto-applied in v1.
`source-error` issues are reported separately and never change the document.

---

## 6. Correction rules

Apply a patch automatically only when **all** of these hold:

1. `classification === 'CONVERSION_ERROR'`.
2. `evidenceKind` is `pdf-text` or `pdf-visual`; `issueClass` is `source-fidelity`.
3. `confidence === 'high'`.
4. Evidence is deterministically grounded:
   - `pdf-text`: the quoted evidence occurs in the normalized page text.
   - `pdf-visual`: the verifier returns `accept` with a description that matches the page image.
   - A `markdown` evidence kind never qualifies for auto-apply.
5. The issue resolves to exactly one page with `high` or `medium` alignment confidence.
6. The patch anchor resolves to exactly one location via `exact` plus `before`/`after`.
7. The patch is within the size limits in §4.
8. The verification pass accepts it, using an independent verifier for math, tables, numbers,
   reading order, and missing content. Independent means a different model or provider; if only one
   model is available, those categories are report-only.
9. The run is not `PARTIAL`; once a run becomes partial, no further patches are applied and
   downstream uses the raw Markdown.

Without a PDF, source-fidelity issues may be reported but never auto-applied. Everything else is
flagged in the issue log. In particular:

- `POSSIBLE_SOURCE_ERROR`: never changed; listed separately in the report.
- `STRUCTURAL_ISSUE`: flagged, with a proposed correction if the model supplied one.
- `UNVERIFIABLE`: flagged, with the reason (no image, low-quality scan, ambiguous alignment).
- `markdown-validity`: reported from Markdown evidence; never auto-applied in v1.
- `move` operations: always flagged in v1.
- Large missing/duplicated sections: flagged rather than reconstructed.

The applier prefers the smallest patch that restores fidelity. It never reformats correct prose,
never normalises spelling to a preferred variant, and never changes educational terminology.

---

## 7. Verification pass

1. **Evidence grounding (before application).** For `pdf-text`, require the evidence quote to occur
   in the normalized page text. For `markdown-validity`, require the evidence snippet to occur in
   the Markdown slice. For `pdf-visual`, grounding is deferred to the verifier call in step 2.
   Failed grounding downgrades the issue to `UNVERIFIABLE`; the patch is not applied.
2. **Patch verification (always, every candidate LLM patch).** Send the patch, the original and
   corrected snippets, and the page reference to a verifier call with a separate prompt and cache.
   For math, tables, numbers, reading order, and missing content, the verifier must use a different
   model or provider (`PROOFREAD_VERIFIER_MODEL` / `PROOFREAD_VERIFIER_PROVIDER`). It must return
   `accept`/`reject` with evidence. Rejected candidates are not applied and are downgraded to
   flagged. If the required independent verifier is unavailable, the patch is not auto-applied.
3. **Apply accepted patches.** The deterministic applier writes `proofread.md` and records every
   accepted, deterministic, and rejected patch in `patches.json`.
4. **Changed-page re-review (default).** Re-run detection on the pages that changed. Re-align
   changed pages before reviewing; never reuse raw-Markdown line ranges against `proofread.md`.
   New issues are added to the log; no new patches are auto-applied in this pass.
5. **Deterministic full scan.** Re-run every check in §5 over the complete proofread Markdown.
6. **Invariant checks.** No missing pages, no duplicated blocks introduced, no lost headings,
   no broken tables/lists, all page-map markers occur at safe boundaries, and the raw Markdown hash
   matches the one recorded in `patches.json`.

The verification pass has its own cache, prompt version, provider, and model. If any verification
call fails, the candidate patch is not applied and the run status becomes `NEEDS_REVIEW` or
`PARTIAL`.

`--proofread-verify full` optionally re-reviews every page in a second pass. This is recorded in the
report; it is not required for `PASS`, because every candidate correction is already re-checked
against the PDF before application, and the full document is re-scanned deterministically.

The report states exactly which pages were inspected, which were re-inspected, which were not, and
which verifier model/prompt version was used.

---

## 8. Output artifacts

### Standalone

```text
<output>/
  <doc-id>.proofread.md          # best available corrected copy, for inspection
  <doc-id>.proofread-report.md
  proofread/
    issues.json
    patches.json
    page-map.json
    status.json
    pages/<page>.json
```

`proofread.md` is written whenever the proofreader produces a corrected copy. Downstream uses it
only when mode is `apply` and the status is not `PARTIAL`; `status.json.downstreamSource` records
`raw` or `proofread`. Report mode and `PARTIAL` runs therefore leave pack output unchanged. A
`PARTIAL` `proofread.md` contains only completed patches and is explicitly marked review-only in
the report.

### Embedded in `pack-extract`

```text
output/<manifest.id>/
  source/
    <base>.md                    # raw LitParse output (unchanged)
    <base>.proofread.md          # corrected copy for inspection; used downstream only in apply + non-PARTIAL
  review/proofread/
    proofread-report.md
    issues.json
    patches.json
    page-map.json
    status.json
    pages/<page>.json
  cache/proofread/reference/     # page text + screenshots + manifest.json
  cache/proofread/review/        # per-window LLM responses
  cache/proofread/verify/        # patch verification responses
```

The raw file is never overwritten. `proofread.md` is reconstructable from the raw file and the
applied patches in `patches.json`, including optional page-map markers. Rejected patches are logged
but excluded from reconstruction.

### `issues.json`

One machine-readable object containing the issues from §4 plus run metadata:

```json
{
  "documentId": "nios-math-level-a",
  "status": "PASS_WITH_WARNINGS",
  "pdfSha256": "…",
  "rawMarkdownSha256": "…",
  "proofreadMarkdownSha256": "…",
  "pageMapSha256": "…",
  "patchesSha256": "…",
  "liteparseVersion": "2.11.0",
  "referenceMode": "auto",
  "provider": "openai",
  "reviewModel": "gpt-4o",
  "verifierProvider": "openai",
  "verifierModel": "gpt-4o-mini",
  "promptVersion": "…",
  "verifierPromptVersion": "…",
  "schemaVersion": "…",
  "generatedAt": "…",
  "issues": []
}
```

Issue IDs are run-local, assigned in resolved page (when available) / line order (`P001`, `P002`, …),
not from model-supplied line numbers. Each issue records its resolved `page` when a page map exists,
`autoApplied: true|false`, `verification: 'accepted'|'rejected'|'not-run'`, and the patch.

### `proofread-report.md`

Required sections, based on the feature brief:

1. Document identification.
2. Pages inspected and pages not inspected, with reference kind (`text` / `vision`) and confidence.
3. Reference provenance: LitParse version, parse options hash, and any mismatch.
4. Summary of confirmed corrections.
5. Conversion issues found.
6. Possible source errors.
7. Unresolved ambiguities.
8. Tables, diagrams, or images requiring manual inspection.
9. Overall review status and why it was assigned.
10. Verification models, verifier prompt version, and any verifier failures.
11. Partial fallback: whether downstream used raw Markdown and why.
12. Estimated cost and cache usage.

Issue log table:

| ID | Page / line | Category | Classification | Finding | Action | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P001 | 12 | list-structure | CONVERSION_ERROR | List numbering lost | Auto-corrected | High |
| P002 | 18 | table-structure | STRUCTURAL_ISSUE | Table columns misaligned | Flagged | Medium |
| P003 | 23 | math-notation | POSSIBLE_SOURCE_ERROR | Printed answer may be incorrect | No change | Medium |

Only actual findings are listed. Example rows are not emitted. Without a PDF, the column contains the
Markdown line range instead of a page number.

### `status.json`

```json
{
  "status": "PASS_WITH_WARNINGS",
  "statusReasons": ["text-only prose pages", "two non-material punctuation warnings"],
  "pagesTotal": 131,
  "pagesInspected": 131,
  "pagesRoutedText": 64,
  "pagesRoutedVision": 67,
  "pagesUnverified": 0,
  "pagesUnaligned": 0,
  "pagesMarkerSkipped": 0,
  "referenceMismatch": false,
  "issuesTotal": 7,
  "conversionErrorsCorrected": 4,
  "unresolvedIssues": 3,
  "manualReviewPages": [18, 23],
  "costEstimateUsd": 0.93,
  "pageMapAvailable": true,
  "downstreamSource": "proofread",
  "partialFallbackUsed": false,
  "generatedAt": "…"
}
```

The numbers above are illustrative. The cost/routing spike replaces them with measured values
before defaults are accepted. `partialFallbackUsed` is `true` when downstream used raw Markdown
because the proofread status was `PARTIAL`. `downstreamSource` is `raw` for report mode, `PARTIAL`
runs, and proofreading failures; otherwise it is `proofread`. In no-PDF mode,
`pageMapAvailable` is `false` and page counts are `0`.

### Exit codes

- `0` — `PASS` or `PASS_WITH_WARNINGS`.
- `1` — `NEEDS_REVIEW` or `PARTIAL`, or an internal/usage error.
- Embedded `pack-extract` runs keep their existing exit semantics unless `--proofread-strict` is set;
  without strict mode a proofreading `PARTIAL` is recorded but does not fail extraction.

### Final CLI summary

The command prints:

1. Review status.
2. Confirmed conversion errors corrected.
3. Unresolved issues.
4. Pages/sections requiring human review.
5. Paths to the corrected Markdown, report, and issue log.

---

## 9. Status rules

Status precedence is strict:

```text
PARTIAL > NEEDS_REVIEW > PASS_WITH_WARNINGS > PASS
```

When more than one status could apply, the highest-precedence status wins. A run with no PDF is
always `PARTIAL`, even if the Markdown is structurally clean.

| Status | Conditions |
| --- | --- |
| `PASS` | Every content page aligned at `high`/`medium` and inspected with an adequate reference; every visual page used vision; no unresolved material issue; all applied LLM patches independently verified; all page-map markers pass invariant checks; no unverified or unaligned pages; no reference mismatch; no unreported page-marker skips |
| `PASS_WITH_WARNINGS` | Every content page inspected and covered; no unresolved material issue; only non-material uncertainties or low-confidence flags without a source-fidelity correction remain; text-only references used only on pages routed to text; no unverified visual pages; no unaligned content. A reference mismatch may land here only after a deep diff accepts equivalence |
| `NEEDS_REVIEW` | Every content page inspected and covered, but at least one unresolved material issue remains, a source-fidelity correction is low-confidence, a visual page was forced to text-only, a required verifier was unavailable, or a reference mismatch was not accepted |
| `PARTIAL` | Any content page or region was not inspected, the PDF is unavailable, a required vision reference could not be obtained, page alignment failed for content, the budget/run aborted, or the reference is too incomplete to align against |

Definitions:

- **Content page:** a page with text, a table, a figure, math, or any non-blank visual element.
  Blank pages are recorded but do not require a reference.
- **Inspected:** the page was in a review window and its reference was available. Previous/next
  pages supplied only as context do not count as inspected.
- **Material issue:** affects content fidelity or correctness, including missing/duplicated content,
  reading order, math, numbers/dates/units, table/list structure, heading hierarchy, or a
  `CONVERSION_ERROR`/`POSSIBLE_SOURCE_ERROR`. Cosmetic punctuation, whitespace, pure formatting,
  page chrome, and non-semantic differences are non-material.
- **Adequate reference:** vision for a page routed to vision; LitParse page text for a page routed
  to text. Text-only prose is adequate for ordering/duplication checks, but `PASS` still means
  “consistent with the LitParse text layer,” not “visually verified.”
- **Unverified visual page:** a page routed to vision that was not inspected with an image.
- **Reference mismatch:** the reference parse version/options are unknown or differ from the raw
  Markdown’s provenance and have not been accepted by a deep per-page diff.

`PARTIAL` always falls back to raw Markdown downstream in v1. `NEEDS_REVIEW` may use proofread
Markdown because every applied LLM patch is independently verified, but the report and status must
be carried into downstream review.

---

## 10. CLI and configuration

### New flags on `pack-extract`

| Flag | Default | Meaning |
| --- | --- | --- |
| `--proofread` | off | Enable the proofreading pre-stage |
| `--proofread-mode <report\|apply>` | `apply` | Report-only, or apply verified corrections and use them downstream |
| `--proofread-pdf <file>` | source when PDF | Original PDF for a Markdown source |
| `--proofread-reference <auto\|vision\|text>` | `auto` | Page reference routing |
| `--proofread-model <model>` | `PROOFREAD_MODEL` or escalation model | Vision-capable model for the review |
| `--proofread-provider <name>` | `PROOFREAD_PROVIDER` or `LLM_PROVIDER` | Provider for proofreading |
| `--proofread-verifier-model <model>` | `PROOFREAD_VERIFIER_MODEL` or escalation model | Independent verifier for high-risk patches |
| `--proofread-verifier-provider <name>` | `PROOFREAD_VERIFIER_PROVIDER` or review provider | Verifier provider |
| `--proofread-budget-usd <n>` | `PROOFREAD_BUDGET_USD` or `1.0` | Sub-cap, never additive to the global cap |
| `--proofread-pages <range>` | all | Subset re-run, e.g. `12-20`; see semantics below |
| `--proofread-window <n>` | `2` | Text pages per review call |
| `--proofread-page-markers` / `--no-proofread-page-markers` | off | Insert `<!-- pdf-page: N -->` patches at safe block boundaries |
| `--proofread-verify <changed\|full>` | `changed` | Verification scope |
| `--proofread-strict` | `false` | Exit 1 on `NEEDS_REVIEW` or `PARTIAL` |
| `--dry-run` | existing | Stage-aware plan; proofread plan + cost estimate when `--proofread` is set |

`--proofread` is opt-in and does not select chapter extraction. If proofreading itself fails
(provider error, budget), the run keeps the raw Markdown, writes a `PARTIAL` report, and — unless
`--proofread-strict` is set — continues downstream extraction with the raw Markdown. This avoids
coupling a pre-stage QA failure to the whole extraction run.

No PDF means text-only review: `--proofread-reference vision` and `--proofread-page-markers` are
usage errors in that mode, because there is no page map or image reference.

`--proofread-pages` re-runs only the requested pages. It may reuse prior page artifacts only when
the raw Markdown hash and reference manifest match. A subset re-run can never produce `PASS`; it is
`PARTIAL` unless a complete prior proofread for the same raw hash is merged in, in which case the
merged status is recomputed. Without a complete prior run, downstream uses raw Markdown. The flag
requires a PDF/page map; using it in no-PDF mode is a usage error.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PROOFREAD_PROVIDER` | `LLM_PROVIDER` | Proofreading provider |
| `PROOFREAD_MODEL` | `LLM_ESCALATION_MODEL` / `gpt-4o` | Vision-capable review model |
| `PROOFREAD_VERIFIER_PROVIDER` | review provider | Verifier provider |
| `PROOFREAD_VERIFIER_MODEL` | `LLM_ESCALATION_MODEL` when different from review, else review model | Independent verifier for high-risk patches; high-risk auto-apply is disabled if this equals the review model and the provider is the same |
| `PROOFREAD_REFERENCE` | `auto` | Reference routing |
| `PROOFREAD_DPI` | `150` | Page screenshot DPI; reduced for oversized images |
| `PROOFREAD_BUDGET_USD` | `1.0` | Proofreading sub-cap |
| `PROOFREAD_MAX_OUTPUT_TOKENS` | stage default | Output ceiling |
| `LLM_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | — | Shared credentials |

The review model must accept image input. If the configured model/provider cannot accept images,
pages routed to vision are `UNVERIFIABLE` and the run is `PARTIAL`; there is no silent text-only
fallback for those pages. The existing `--provider`, `--fast-model`, and `--escalation-model`
continue to control the chapter pipeline; proofreading has its own model settings because it may
need vision and a different output budget.

**Budget semantics:** `--max-budget-usd` is the total cap for an embedded run. The proofreading
sub-cap is `min(--proofread-budget-usd, remaining total budget)`. The proofreader and chapter
pipeline share one budget ledger, so enabling both cannot exceed the global cap. Standalone
`proofread-md` uses the proofreading sub-cap as its total cap.

### `--dry-run`

When `--proofread` is set, writes `review/proofread/dry-run.json`:

- page count, reference routing per page (text/vision), and alignment confidence;
- vision-page ratio and image dimensions/token estimate;
- estimated review, verification, and total cost;
- cache hits and the projected full-book cost;
- no LLM calls, and no new screenshots unless they are already cached.

If chapter extraction is also selected, the existing chapter `review/run-report.json` dry-run is
written too. If `--proofread` is absent, `--dry-run` keeps its current chapter-pipeline behavior.

This dry-run is the **cost/routing spike**: defaults are not accepted until it has been run against
the 131-page NIOS book and the measured vision ratio and projected cost fit the default budget.

---

## 11. Cost, caching, and performance

- **Page scope** keeps input bounded; a whole textbook is never sent in one call.
- **Routing** avoids image tokens for prose pages; a bare pipe does not force vision.
- **Cache:**
  - reference: `sha256(pdf bytes + liteparseVersion + full parse options + dpi)`;
  - review: `sha256(page numbers + window Markdown + reference text hash + screenshot hash +
    referenceKind + route + promptVersion + schemaVersion + provider + model + maxTokens +
    temperature)`;
  - verification: `sha256(patch hash + page reference hash + verifier prompt version + schema
    version + verifier provider + verifier model + evidence)`.
- **Resume:** unchanged pages and unchanged patches replay for free. `--force` busts reference,
  review, and verification caches.
- **Budget:** proofreading uses a sub-cap inside the shared total budget ledger. Calls are charged
  against estimates, not billed usage (pipeline-llm exposes no usage). The proofreader cannot
  consume budget reserved for chapter extraction, and the combined run cannot exceed the global
  cap.
- **Cost is an estimate:** the 131-page pilot’s measured text/vision mix is the source of truth.
  The dry-run must report the projected review, verification, and total cost; no fixed dollar range
  is a design assumption.
- **Image limits:** oversized screenshots are recaptured at lower DPI before being sent. Pages that
  still exceed the provider limit are flagged `UNVERIFIABLE`, not split or silently truncated.
- **Concurrency:** v1 runs sequentially because the existing `BudgetGuard` is not concurrency-safe.
  Page windows are independent, so bounded concurrency is a later optimization.
- **Retries:** reuse the chapter pipeline's bounded exponential backoff. The vision client also
  retries once on schema-invalid JSON, then marks the page `UNVERIFIABLE`. Verification retries are
  charged to the same budget ledger.

---

## 12. Error handling

| Failure | Behavior |
| --- | --- |
| No API key | Proofreading is skipped; status `PARTIAL`; raw Markdown retained; downstream uses raw; extraction continues |
| PDF missing/unreadable or not supplied | If the source is Markdown, structural/text-only review; status `PARTIAL`; source accuracy explicitly unverified; source-fidelity issues are report-only and never auto-applied. If the source is a PDF, the parse failure is a run error |
| Screenshot/render failure | No text fallback for a page routed to vision; page is `UNVERIFIABLE`; status `PARTIAL`; page listed for manual inspection |
| Oversized screenshot | Recapture at lower DPI; if still over the provider limit, `UNVERIFIABLE`/`PARTIAL` |
| Page alignment failure | No patches on that page; if it contains content the status is `PARTIAL`; page listed for manual inspection |
| Reference version/option mismatch | Align anyway; status is capped at `NEEDS_REVIEW` unless a deep diff accepts equivalence. If the reference is too incomplete to align, status is `PARTIAL` |
| Schema-invalid LLM response | One retry; then page-level `UNVERIFIABLE`, issue recorded; status `PARTIAL` if the page contains content |
| Patch anchor ambiguous or missing | Patch rejected; issue flagged with reason; `NEEDS_REVIEW` if material |
| Verifier unavailable or rejects | Candidate patch is not applied; issue flagged; `NEEDS_REVIEW` if the page was inspected, `PARTIAL` if verification could not run for a content page |
| Budget exceeded | Stop cleanly, keep completed pages/patches; status `PARTIAL`; downstream uses raw; exit 1 only with `--proofread-strict` |
| `--proofread-pages` without complete prior run | Status `PARTIAL`; downstream uses raw |
| `--proofread-pages` without a PDF/page map | Usage error; no proofreading run |
| Prompt injection in source | Document text is delimited as untrusted; model instructed to ignore embedded instructions; no tool use in review calls |

---

## 13. Testing and evaluation

No live LLM calls in CI.

Unit tests:

- page alignment: exact anchors, fuzzy anchors, monotonic ranges, unaligned pages, pilot coverage;
- reference routing: OCR/table/figure/complex pages choose vision; prose chooses text; incidental
  pipes do not force vision;
- reference provenance: version/option mismatch, cache-key invalidation, manifest round-trip;
- patch applier: replace/insert/delete, context-resolved repeated text, ambiguous anchors,
  overlapping patches, same-line insert ordering, offset tracking, size limits, rejected patches;
- page markers: safe-boundary detection, skipped mid-block markers, marker patches in
  `patches.json`, raw + patches reconstruction, idempotent re-run;
- issue assignment: `page` derived from `page-map`, ambiguous issues become `UNVERIFIABLE`,
  missing-content dedup with empty anchors;
- evidence grounding: text quote present/absent, Markdown evidence, visual evidence;
- independent verification: high-risk patch uses verifier, verifier unavailable -> no auto-apply;
- deterministic checks: headings, fences, tables, math delimiters, duplicates, encoding, arithmetic;
- status computation: precedence matrix, material vs non-material, no PDF, visual-page text
  override, unaligned page, reference mismatch;
- no-PDF mode: `page-map.json` is unavailable, issue pages are omitted, page markers are refused,
  and no source-fidelity patch is auto-applied;
- issue ID stability and report rendering;
- cache key stability and free replay with a `FailingProofreadClient`;
- combined budget ledger: proofreading cannot exceed the global cap.

Integration tests:

- `FakeProofreadClient` returns deterministic issues for a synthetic 3-page Markdown fixture.
  Assert: raw file unchanged, only high-confidence conversion errors applied, report/issue log
  written, status correct, page numbers resolved.
- `--proofread` works through both the legacy `emitLesson` path and the chapter `orchestrate` path.
- `--proofread-mode report` leaves downstream packs byte-identical.
- `--proofread` off leaves existing `extract:slice` output byte-identical.
- `PARTIAL` falls back to raw Markdown downstream.
- Budget abort leaves a resumable artifact set and never applies further patches.
- `--proofread-pages` without a complete prior run is `PARTIAL`.
- Page markers reconstruct byte-for-byte from raw + patches.
- `--proofread-verify full` records re-inspected pages without changing auto-apply rules.

Evaluation on the real book (manual, not CI):

- Input: `pdf/Math_Level_A_english_medium.pdf` + `pdf/Math_Level_A_english_medium.md`.
- Oracle: `pdf/corrected_markdown.md`, used as a diff source, not as ground truth.
- Derive an oracle correction set:
  1. Align raw and corrected paragraphs.
  2. Classify each diff as conversion error, possible source error, or style/formatting-only.
  3. Drop style-only changes and human preferences that are not source corrections.
  4. Manually adjudicate ambiguous cases.
- Metrics: auto-applied patch precision, recall of oracle conversion errors, false-positive rate per
  category, page-alignment coverage, and status correctness.
- Acceptance gates before trusting defaults: 100% of auto-applied patches manually judged correct on
  the first 20 pages; ≥95% auto-apply precision on a stratified sample; no material regressions;
  alignment meets the pilot gate in §3.
- Sample stratified: first 20 pages, 20 random body pages, and 20 math/table/figure-heavy pages.
  Keep a held-out set for final evaluation; do not tune on all pages.

---

## 14. Security and privacy

- Page images and text are sent to the configured LLM provider. This must be explicit in the
  README and in the report. `--proofread-reference text` avoids sending images.
- Credentials come from the existing environment variables and are never written to artifacts.
- Cached page images and LLM responses live under the output directory; they inherit the
  repository's existing `output/` handling.
- Source text is treated as untrusted data; the prompt does not grant it tool access.

---

## 15. Package layout

New code, all inside `packages/pack-extraction`:

```text
src/proofread/
  types.ts                 # zod schemas: issue, patch, page review, status, report
  reference.ts             # LitParse page text, complexity, screenshots + cache
  align.ts                 # raw Markdown ↔ PDF page alignment
  window.ts                # page windows + token estimates
  prompt.ts                # versioned system/user prompt construction
  client.ts                # ProofreadClient interface
  http-client.ts           # vision-capable OpenAI-compatible structured client
  fake.ts                  # deterministic test double
  checks.ts                # deterministic validators
  detect.ts                # per-window LLM detection + parsing/dedup
  patch.ts                 # anchor validation, patch application, patch log
  verify.ts                # patch verification + changed-page re-review
  orchestrate.ts           # runProofread() end-to-end
  report.ts                # report.md, issues.json, status.json
  cli.ts                   # proofread-md entry point
  __tests__/               # unit + integration tests
```

Modified files:

- `src/parse/index.ts` — optionally expose the source PDF path and per-page reference (or leave the
  proofreader to construct it);
- `src/cli/index.ts` — `--proofread*` flags, pre-stage wiring for both `emitLesson` and
  `orchestrate`, `writeSource` + proofread source, partial fallback, stage-aware `--dry-run`;
- `src/run/orchestrate.ts` — accept optional proofread status/metadata from the CLI (the Markdown
  argument itself is unchanged) and carry the proofread status into downstream review artifacts;
- `src/chapters/toc.ts` — unchanged in v1; page markers are not form feeds, so `pageStart`/
  `pageEnd` stay undefined unless a later page-aware segmenter is added;
- `package.json` — the `proofread-md` bin, and a LitParse dependency floor that includes
  `screenshot()` plus `includeComplexity` (currently resolved to `2.11.0`; verify before pinning);
- `README.md` and this document.

---

## 16. Task breakdown

1. Types + schemas + status/report writers, including optional issue `page` (no-PDF mode), evidence
   class, patch origin, and status precedence.
2. Reference builder: LitParse per-page text, complexity, screenshots, full option mirroring,
   provenance manifest, cache.
3. Page aligner + `page-map.json` (including `available: false` for no-PDF); pilot gate on the
   131-page NIOS raw parse.
4. Deterministic checks; arithmetic checker; source-fidelity vs markdown-validity classification.
5. Prompt + detection client (text) + fake client; windowing; dedup; page assignment.
6. Patch applier with context-resolved anchors, same-line ordering, size limits, page-map marker
   patches, reconstruction check, and idempotence.
7. Vision client + routing; screenshot input; oversized-image fallback; schema retry.
8. Evidence grounding + independent verifier + changed-page re-review + full deterministic scan.
9. `runProofread()` orchestration, shared budget ledger, cache, stage-aware dry-run, and the
   cost/routing spike on the real book.
10. Standalone `proofread-md` CLI.
11. Embedded `pack-extract --proofread` integration for both downstream paths, no-PDF text-only
    mode, partial fallback, page markers, stage-aware dry-run selection, and review flags.
12. Tests + real-book evaluation against the classified `corrected_markdown.md` oracle; tune
   prompt/routing.

### Verification gates

```bash
pnpm --filter @open-edu/pack-extraction build
pnpm --filter @open-edu/pack-extraction test
pnpm --filter @open-edu/pack-extraction typecheck
pnpm --filter @open-edu/pack-extraction lint
pnpm extract:slice                # proofreading off: pack output unchanged
```

Manual:

```bash
node packages/pack-extraction/dist/proofread/cli.js \
  --pdf pdf/Math_Level_A_english_medium.pdf \
  --markdown pdf/Math_Level_A_english_medium.md \
  --output output/nios-math-level-a-proofread \
  --mode apply --dry-run          # inspect page routing + cost
# then without --dry-run; inspect the report and the first 20 corrections
```

---

## 17. Limitations and open questions

- **Page alignment is best-effort.** If a Markdown file was heavily edited after parsing, anchors
  may fail; those pages are marked unaligned rather than guessed. The pilot gate must pass before
  auto-apply is enabled.
- **No-PDF mode is not page-aware.** It can inspect Markdown structure and text, but it cannot
  assign PDF pages, insert page markers, or verify source fidelity; the run is always `PARTIAL`.
- **Text reference is not the visual PDF.** On prose pages it is sufficient to catch ordering,
  duplication, and text differences, but it is derived from the same converter family and can
  repeat its errors. `PASS` on text-only prose means “consistent with the LitParse text layer,” not
  “visually verified.” Math, tables, and figures require vision.
- **Reference drift.** The raw Markdown may predate the reference parse version/options. The
  provenance manifest and deep-diff gate cap the status when equivalence cannot be shown.
- **Vision models can misread.** Every patch needs evidence grounding and an independent
  verification call; low-confidence or large changes are never applied automatically.
- **Oversized images are flagged, not cropped.** v1 reduces DPI and then marks the page
  `UNVERIFIABLE`; text-item cropping is a follow-up.
- **Page markers are not pagination.** They are optional provenance patches. Chapter
  `pageStart`/`pageEnd` remain undefined unless a page-aware segmenter consumes `page-map.json`.
- **Arithmetic checks can false-positive.** They only flag simple literal expressions and never
  auto-correct.
- **Second parse cost.** The reference builder re-parses the PDF. It is cached, but a future
  single-pass extractor would remove the duplicate work.
- **The extractor still needs `lit` on PATH.** The proofreader uses the API, so it can run without
  the CLI, but a PDF source cannot be parsed unless the existing extractor dependency is available.
- **No billed-usage data.** All costs are estimates (chars/4 plus an image-token heuristic). The
  dry-run spike replaces illustrative figures.
- **The manual oracle is not exhaustive.** `corrected_markdown.md` includes style choices; only
  classified conversion errors are used for evaluation.
- **V1 does not auto-move content.** Reading-order fixes are proposed and flagged, not applied,
  until the patch engine can prove a move is safe.
- **Downstream provenance.** Packs remain `derivedFrom: "document"`; the proofread report records
  that the source was corrected, and the raw parse plus `patches.json` remain available for audit.
