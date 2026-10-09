# open-edu-pipeline

Standalone AI-driven content-to-course-spec generation pipeline, extracted from the
[open-edu](https://github.com/KnowledgeAssembly/open-edu) monorepo.

## Packages

- `packages/pipeline` — `@open-edu/pipeline`: 8-stage PDF → course-spec pipeline + CLI
- `packages/pipeline-llm` — `@open-edu/pipeline-llm`: LLM provider abstraction (vendored and
  renamed from `@open-edu/llm-config`; this copy is free to diverge for pipeline-specific needs)
- `packages/pack-extraction` — `@open-edu/pack-extraction`: deterministic, source-grounded
  knowledge/curriculum **pack** extraction (pack format "openedu-pack"). No LLM calls, no keys.

## Quick start

```bash
pnpm install
pnpm build
pnpm curriculum:generate --pdf ./textbook.pdf --level B --subject math   # course-spec pipeline
pnpm extract:slice                                                       # knowledge/curriculum packs
```

Full CLI reference, profiles, scope options, and configuration live in
[`packages/pipeline/README.md`](packages/pipeline/README.md).

## Pack extraction (vertical slice)

`@open-edu/pack-extraction` ingests source documents and emits two packs — a knowledge pack
(`concepts.json`) and a curriculum pack (`curriculum.json`) — each with a manifest and
`sources.json`. It is fully deterministic and offline; fidelity gaps are recorded honestly
(`review/fidelity-report.json` = `{"status": "pending-llm"}`) instead of faked.

The slice fixture lives in [`fixtures/nios-math-a/`](fixtures/nios-math-a/) — one markdown lesson
and its source manifest. Run the CLI:

```bash
pnpm extract:slice
# node dist/cli/index.js --source ../../fixtures/... --manifest ../../fixtures/... --output ../../output --validate
```

Output lands under `output/<manifest.id>/`:
`source/`, `source-model/`, `review/`, `packs/knowledge/<id>/`, `packs/curriculum/<id>/`.

CLI flags: `--source <file> --manifest <file>`, `--output <dir>`, `--knowledge-pack-id <id>`,
`--curriculum-pack-id <id>`, `--validate` (runs both pack validators, exit 1 on failure),
`--help`. The specification and implementation plan live in
[`docs/OPENEDU-KNOWLEDGE-EXTRACTION.md`](docs/OPENEDU-KNOWLEDGE-EXTRACTION.md) and
[`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

## Commands

```bash
pnpm build            # build all packages
pnpm test             # run all tests
pnpm lint             # lint all packages
pnpm typecheck        # type-check all packages
pnpm format:check     # check formatting
pnpm curriculum:generate --pdf <file> [options]   # run the course-spec pipeline
pnpm extract:slice                                # run pack extraction on the slice fixture
```

## Environment

Copy `.env.example` to `.env` and set at least one provider API key
(`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`). Non-markdown
extraction (PDF, DOCX, PPTX, images, …) requires the `lit` CLI from
`@llamaindex/liteparse` to be available on `PATH` — markdown extraction is in-process.
`extract:slice` needs no environment configuration at all.
