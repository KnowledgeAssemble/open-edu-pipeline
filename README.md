# open-edu-pipeline

Standalone AI-driven content-to-course-spec generation pipeline, extracted from the
[open-edu](https://github.com/KnowledgeAssembly/open-edu) monorepo.

## Packages

- `packages/pipeline` — `@open-edu/pipeline`: 8-stage PDF → course-spec pipeline + CLI
- `packages/pipeline-llm` — `@open-edu/pipeline-llm`: LLM provider abstraction (vendored and
  renamed from `@open-edu/llm-config`; this copy is free to diverge for pipeline-specific needs)

## Quick start

```bash
pnpm install
pnpm build
pnpm curriculum:generate --pdf ./textbook.pdf --level B --subject math
```

Full CLI reference, profiles, scope options, and configuration live in
[`packages/pipeline/README.md`](packages/pipeline/README.md).

## Commands

```bash
pnpm build            # build all packages
pnpm test             # run all tests
pnpm lint             # lint all packages
pnpm typecheck        # type-check all packages
pnpm format:check     # check formatting
pnpm curriculum:generate --pdf <file> [options]   # run the pipeline
```

## Environment

Copy `.env.example` to `.env` and set at least one provider API key
(`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`). Non-markdown
extraction (PDF, DOCX, PPTX, images, …) requires the `lit` CLI from
`@llamaindex/liteparse` to be available on `PATH` — markdown extraction is in-process.
