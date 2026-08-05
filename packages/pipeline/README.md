# @open-edu/pipeline

AI-driven content-to-course-spec generation pipeline. Transforms educational source files (PDF, DOCX, PPTX, Markdown, Images, ZIP) into validated OpenEdu course specifications through an 8-stage pipeline with profile-aware generation and pluggable extraction.

## Pipeline Stages

```
Source File (PDF, DOCX, PPTX, Markdown, Images, ZIP)
    │
    ▼
┌──────────────────┐
│  1. Extract      │  Pluggable extraction via @llamaindex/liteparse
│                  │  (PDF, DOCX, PPTX, XLSX, images, Markdown)
├──────────────────┤
│  2. Source       │  Taxonomy-driven unit classification + LLM reclassification
│     Inventory    │  for unclassified segments
├──────────────────┤
│  3. Concept Map  │  LLM generates teachable concepts from source units
│                  │  with profile-aware prompts (subject, teaching style)
├──────────────────┤
│  4. Lesson       │  One blueprint per concept: lesson arc, widget requests,
│     Blueprints   │  asset requests, question families
├──────────────────┤
│  5. Activity     │  Generates activities from blueprint lesson arcs
│     Generation   │  (hook → observe → practice → mastery → reflection)
├──────────────────┤
│  6. Asset Plan   │  LLM plans visual assets; SVG renderer registry
│                  │  generates accessible SVGs
├──────────────────┤
│  7. Validation   │  Pluggable validators (structure, math, science),
│                  │  widget config validation, coverage ledger
├──────────────────┤
│  8. Output       │  Renders course-spec.json + course-spec.md,
│                  │  quality report, pipeline manifest
└──────────────────┘
    │
    ▼
  course-spec.json + course-spec.md
```

## CLI Usage

```bash
# Basic: generate a math course from a PDF
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./textbook.pdf --level B --subject math

# Generate from a DOCX file
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./lesson.docx --subject english --profile generic

# Generate from a PowerPoint presentation
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./slides.pptx --subject biology --profile science

# Generate from a ZIP archive containing mixed documents
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./archive.zip --subject history --profile generic

# Specify a profile explicitly
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./textbook.pdf --subject science --profile science

# Generate a single chapter by scope
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./textbook.pdf --subject math --profile math --scope chapter-index:1

# JSON-only output with verbose logging
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./textbook.pdf --subject math --format json --verbose

# Resume from intermediate artifacts
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf ./textbook.pdf --subject math --resume --verbose
```

### CLI Options

| Option                   | Default      | Description                                                        |
| ------------------------ | ------------ | ------------------------------------------------------------------ |
| `--pdf <path>`           | _(required)_ | Path to the input file (PDF, DOCX, PPTX, Markdown, ZIP)            |
| `--level <code>`         | `B`          | Level code (e.g., A, B, C)                                         |
| `--subject <name>`       | `math`       | Subject name (any string)                                          |
| `--profile <id>`         | _(auto)_     | Curriculum profile: `generic`, `math`, `science`, `nios`           |
| `--curriculum <id>`      | —            | Curriculum adapter (e.g., `nios`)                                  |
| `--scope <value>`        | `all`        | See [Scope](#scope) below                                          |
| `--language <code>`      | `en`         | Content language                                                   |
| `--locale <locale>`      | `en-IN`      | Locale (e.g., `en-IN`, `hi-IN`)                                    |
| `--widget-category <id>` | —            | Repeatable. Filter widgets by category (`core`, `math`, `science`) |
| `--format <type>`        | `both`       | Output format: `md`, `json`, `both`                                |
| `--output-dir <path>`    | `./output`   | Custom output directory                                            |
| `--force`                | `false`      | Overwrite existing output                                          |
| `--dry-run`              | `false`      | Validate without LLM calls or file writes                          |
| `--resume`               | `false`      | Resume from intermediate artifacts                                 |
| `--verbose`              | `false`      | Detailed per-stage logging                                         |
| `--max-retries <num>`    | `3`          | Max retries per activity generation                                |
| `--llm-provider <name>`  | from env     | LLM provider override                                              |
| `--llm-model <name>`     | from env     | LLM model override                                                 |

### Scope

The `--scope` option controls which part of the PDF is processed:

| Value                | Description                               |
| -------------------- | ----------------------------------------- |
| `all`                | Process the entire document               |
| `chapter-index:N`    | Process chapter N (1-based)               |
| `chapter-id:ID`      | Process chapter matching a source unit ID |
| `pages:A-B`          | Process a page range                      |
| `source-units:id,id` | Process specific source unit IDs          |

## Curriculum Profiles

The pipeline uses **curriculum profiles** to adapt generation behavior per subject without changing pipeline code:

| Profile   | Subject     | Widgets               | Asset Renderers  | Validators         |
| --------- | ----------- | --------------------- | ---------------- | ------------------ |
| `generic` | any         | `core.*`              | none             | structure          |
| `math`    | mathematics | `core.*`, `math.*`    | 11 SVG renderers | structure, math    |
| `science` | science     | `core.*`, `science.*` | none             | structure, science |
| `nios`    | nios        | `core.*`              | none             | structure          |

Unknown subjects fall back to the `generic` profile automatically.

### Adding a New Profile

1. Create `packages/pipeline/src/profile/builtins/your-subject.ts`:

```ts
import type { CurriculumProfile } from '../types.js';
export const YOUR_PROFILE: CurriculumProfile = { ... };
```

2. Register in `packages/pipeline/src/profile/registry.ts`:

```ts
import { YOUR_PROFILE } from './builtins/your-subject.js';
registerProfile(YOUR_PROFILE);
```

3. Optionally add validators in `packages/pipeline/src/validation/`, renderers in `packages/pipeline/src/assets/registry.ts`.

## Output Artifacts

The pipeline produces these files in the output directory:

| File                                | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `source-inventory.json`             | Classified source units with taxonomy labels |
| `concept-map.json`                  | Generated concepts with source evidence      |
| `lesson-blueprints.json`            | Per-concept lesson blueprints with arcs      |
| `asset-manifest.json`               | Planned visual assets                        |
| `assets/`                           | Generated SVG files + `manifest.json`        |
| `{level}-{subject}course-spec.json` | Machine-readable course spec                 |
| `{level}-{subject}course-spec.md`   | Human-readable course spec                   |
| `coverage-ledger.json`              | Source-to-output coverage tracking           |
| `quality-report.json`               | Validation results + publish gates           |
| `pipeline-manifest.json`            | Input identity for resume detection          |

## Recommended LLM Models per Stage

| Pipeline Stage        | Reasoning Need                  | Recommended Model             |
| --------------------- | ------------------------------- | ----------------------------- |
| `source_inventory`    | Low — classification            | `gpt-4o-mini`                 |
| `concept_map`         | Moderate — structure design     | `gpt-4o` or `claude-sonnet-4` |
| `concept_enrichment`  | Low — metadata extraction       | `gpt-4o-mini`                 |
| `lesson_blueprint`    | Moderate — instructional design | `gpt-4o` or `claude-sonnet-4` |
| `asset_plan`          | Low — asset planning            | `gpt-4o-mini`                 |
| `activity_generation` | Low — content generation        | `gpt-4o-mini`                 |
| `review`              | Moderate — quality review       | `gpt-4o` or `claude-sonnet-4` |

Override models per stage using environment variables:

```bash
LLM_STAGE_CONCEPT_MAP_MODEL=gpt-4o
LLM_STAGE_CONCEPT_MAP_PROVIDER=openai
LLM_STAGE_LESSON_BLUEPRINT_MODEL=claude-sonnet-4
LLM_STAGE_LESSON_BLUEPRINT_PROVIDER=openrouter
```

Or via CLI:

```bash
--stage-model concept_map=gpt-4o --stage-model lesson_blueprint=claude-sonnet-4
```

## Configuration

| Variable                     | Default       | Description                 |
| ---------------------------- | ------------- | --------------------------- |
| `LLM_PROVIDER`               | `openai`      | Default LLM provider        |
| `LLM_MODEL`                  | `gpt-4o-mini` | Default LLM model           |
| `LLM_MAX_TOKENS`             | `4096`        | Max tokens per call         |
| `LLM_TEMPERATURE`            | `0.3`         | LLM temperature             |
| `LLM_STAGE_{STAGE}_MODEL`    | —             | Per-stage model override    |
| `LLM_STAGE_{STAGE}_PROVIDER` | —             | Per-stage provider override |

## Resume & Artifact Identity

The pipeline computes a config hash from PDF content, profile, scope, language, locale, prompt version, and stage model configs. This hash is stored in `pipeline-manifest.json`. On `--resume`:

- If the hash matches, intermediate artifacts (source inventory, concept map, blueprints) are reused.
- If the hash changed (different PDF, profile, or scope), all artifacts are regenerated.
- Cross-scope reuse is prevented (full-document artifacts won't be used for a chapter run).

## Dependencies

- `@open-edu/pipeline-llm` — Vendored LLM provider abstraction (OpenAI + OpenRouter), renamed from `@open-edu/llm-config`
- `@llamaindex/liteparse` — Document extraction; provides the `lit` CLI binary used for PDF/DOCX/PPTX/images. Markdown extraction is in-process and needs no binary.
- `zod` — Runtime schema validation
- In-repo `src/lib/logger.ts` — Minimal leveled console logger (replaces `@open-edu/logger`)

## Testing

```bash
# Run all pipeline tests
pnpm --filter @open-edu/pipeline test

# Run profile-specific tests
pnpm --filter @open-edu/pipeline test -- registry

# Run acceptance tests
pnpm --filter @open-edu/pipeline test -- generic-pipeline

# Type-check and lint
pnpm --filter @open-edu/pipeline typecheck
pnpm --filter @open-edu/pipeline lint
```
