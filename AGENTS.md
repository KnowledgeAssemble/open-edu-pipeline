# AGENTS.md

## Project Overview

OpenEdu Pipeline is a monorepo containing AI-driven educational content processing tools that transform source materials (PDFs, DOCX, PPTX, Markdown) into structured educational outputs. It has three main packages working together in a pnpm workspace.

## Repository Structure

```
open-edu-pipeline/
├── packages/
│   ├── pipeline/           # @open-edu/pipeline - 8-stage PDF→course-spec pipeline + CLI
│   ├── pipeline-llm/       # @open-edu/pipeline-llm - LLM provider abstraction (OpenAI, OpenRouter)
│   └── pack-extraction/    # @open-edu/pack-extraction - Knowledge/curriculum pack extraction
├── docs/                   # Design documents and implementation plans
├── fixtures/               # Test fixtures (e.g., nios-math-a)
└── output*/                # Generated outputs from pipeline runs
```

## Packages

### 1. `@open-edu/pipeline` 
Transforms educational source files into validated OpenEdu course specifications through an 8-stage pipeline:
1. **Extract** - Pluggable extraction via `@llamaindex/liteparse` 
2. **Source Inventory** - Taxonomy-driven unit classification with LLM reclassification
3. **Concept Map** - Profile-aware concept generation
4. **Lesson Blueprints** - Per-concept lesson arcs, widget/asset requests
5. **Activity Generation** - 5-phase activities (hook → observe → practice → mastery → reflection)
6. **Asset Plan** - Visual asset planning with SVG renderers
7. **Validation** - Structure/math/science validators
8. **Output** - Generates `course-spec.json` and `course-spec.md`

**Key features:** Profile-aware generation (generic/math/science/nios), curriculum adapters, scope control (by chapter/pages/units), resume capability with config hashing.

### 2. `@open-edu/pipeline-llm`
LLM provider abstraction layer supporting OpenAI and OpenRouter. Provides `LlmRouter`, model tiers (`fast`/`escalation`), stage-based configuration, and retry logic. Shared by both pipeline and pack-extraction.

### 3. `@open-edu/pack-extraction`
Extracts source-grounded **OpenEdu packs** (knowledge + curriculum) from documents:
- **Deterministic (default)**: Offline, no keys, fully deterministic with fidelity tracking
- **LLM-assisted chapter pipeline (opt-in)**: Per-chapter fast-tier extraction, verification, escalation on failures, cross-chapter merge
- **Markdown proofreading (opt-in)**: PDF-grounded verification and correction of Markdown

Outputs land under `output/<manifest.id>/` with source models, review artifacts, and packs in `packs/knowledge/` and `packs/curriculum/`.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, ESM modules)
- **Package Manager**: pnpm 9+ (workspace monorepo)
- **Build**: `tsc` per package
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **Validation**: Zod schemas
- **Document Extraction**: `@llamaindex/liteparse` (requires `lit` CLI for non-Markdown formats)
- **LLM**: OpenAI/OpenRouter via `@open-edu/pipeline-llm`

## Development Commands

### Root Level
```bash
pnpm install          # Install dependencies
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm lint            # Lint all packages
pnpm typecheck       # Type-check all packages
pnpm format          # Format code
pnpm format:check    # Check formatting
pnpm clean           # Clean all packages
```

### Pipeline Package
```bash
pnpm curriculum:generate --pdf <file> --level B --subject math  # Generate course spec
```

### Pack Extraction Package
```bash
pnpm extract:slice   # Run on fixture (deterministic, no keys needed)
pnpm extract         # Run CLI
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- For pipeline/pack-extraction with LLM: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY` / `LLM_API_KEY`
- For PDF/DOCX/PPTX extraction: `lit` CLI from `@llamaindex/liteparse` must be on PATH
- Markdown extraction is in-process (no external deps)
- See package READMEs for detailed env vars (LLM models per stage, proofreading config, etc.)

## Code Conventions

### TypeScript
- Strict mode enabled with `noUncheckedIndexedAccess`
- ESM modules (`"type": "module"`)
- Use `type` imports: `import type { ... } from ...` (enforced by ESLint)
- Prefer explicit types, Zod for runtime validation
- No unused locals/params (prefix with `_` if intentional)

### File Organization
- Source in `src/`, built output in `dist/`
- Each package has its own `tsconfig.json` extending base
- Tests co-located or in `__tests__` directories
- Prompts often stored as `.txt` files copied during build (see pipeline build script)

### Code Style
- `no-console` is warned (use logger where appropriate)
- `@typescript-eslint/no-explicit-any` is warned
- Follow existing patterns in each module
- Use profile/adapter patterns for extensibility

## Key Architectural Patterns

### Pipeline (@open-edu/pipeline)
- **Graph-based execution**: Uses a graph/workflow system (`src/graph/`)
- **Profile system**: Subject-specific behavior via `src/profile/` (builtins + registry)
- **Pluggable extraction**: Supports multiple formats via `@llamaindex/liteparse`
- **Scope control**: Process entire doc or subset (chapter/pages/units)
- **Resume/resume detection**: Config hash-based artifact reuse
- **Stage model configuration**: Per-stage LLM model/provider overrides

### Pack Extraction (@open-edu/pack-extraction)
- **Dual paths**: Legacy deterministic vs chapter LLM pipeline (auto-selected based on flags/source)
- **Chapter-centric processing**: TOC/heading-based segmentation
- **Verify-before-merge**: Deterministic verification with excerpt grounding
- **Escalation pattern**: Only escalate chapters with failures/coverage gaps
- **Caching**: Per-stage response caching by content hash
- **Proofreading pre-stage**: Optional PDF-grounded Markdown correction

### LLM Abstraction (@open-edu/pipeline-llm)
- **Provider-agnostic**: OpenAI-compatible interface
- **Model tiers**: Fast vs escalation for cost/quality tradeoffs
- **Router**: Central routing with stage awareness
- **Retry/fallback logic**: Built-in resilience

## Working with This Codebase

### Before Making Changes
1. Understand which package(s) are affected
2. Read relevant package README and docs
3. Look at existing patterns in similar modules
4. Check tests for expected behavior

### Building & Testing
- Always build after changing TypeScript: `pnpm build` (or per-package)
- Run tests for affected packages: `pnpm --filter <package> test`
- Typecheck: `pnpm --filter <package> typecheck`
- Note: Some packages copy prompt files during build (pipeline does this manually)

### Adding Features
- **New pipeline profile**: Add to `packages/pipeline/src/profile/builtins/`, register in `registry.ts`
- **New validators/renderers**: Follow existing patterns in respective directories
- **New pack extraction logic**: Consider both deterministic and LLM paths

### Debugging
- Use `--verbose` flag in pipeline CLI for detailed logging
- Check `review/` artifacts in pack-extraction outputs
- Look at `pipeline-manifest.json` for resume/debugging info
- Review `run-report.json` for costs/timings in pack extraction

## Important Notes

- This is extracted from the `open-edu` monorepo - `pipeline-llm` was vendored/renamed from `@open-edu/llm-config`
- Output directories (`output/`, `output-*`) contain generated artifacts and are not source
- `node_modules/` and build artifacts (`dist/`) should not be edited
- The `lit` CLI dependency is external (from `@llamaindex/liteparse`) for non-Markdown document parsing
- Some paths are hardcoded relative to fixtures in scripts (see pack-extraction's `extract:slice`)
- Tests may use fixtures in `fixtures/` or inline test data

## Documentation References

- [Root README](README.md) - Quick start and overview
- [Pipeline README](packages/pipeline/README.md) - Full CLI reference, profiles, stages
- [Pack Extraction README](packages/pack-extraction/README.md) - Modes, CLI, artifacts, proofreading
- [docs/OPENEDU-KNOWLEDGE-EXTRACTION.md](docs/OPENEDU-KNOWLEDGE-EXTRACTION.md) - Pack extraction spec
- [docs/CHAPTER-LLM-PIPELINE-PLAN.md](docs/CHAPTER-LLM-PIPELINE-PLAN.md) - Chapter pipeline design
- [docs/MARKDOWN-PROOFREADING-PLAN.md](docs/MARKDOWN-PROOFREADING-PLAN.md) - Proofreading design
