import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CLIOptions {
  pdf: string;
  level: string;
  subject: string;
  force: boolean;
  profileId?: string;
  curriculum?: string;
  scope: string;
  language: string;
  locale: string;
  widgetCategories: string[];
  llmProvider?: string;
  llmModel?: string;
  dryRun: boolean;
  resume: boolean;
  verbose: boolean;
  outputDir: string;
  maxRetries: number;
  format: 'md' | 'json' | 'both';
  stageOverrides?: string[];
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CLIOptions {
  const args = argv;
  const options: CLIOptions = {
    pdf: '',
    level: 'B',
    subject: 'math',
    force: false,
    scope: 'all',
    language: 'en',
    locale: 'en-IN',
    widgetCategories: [],
    dryRun: false,
    resume: false,
    verbose: false,
    outputDir: join(__dirname, '..', '..', '..', '..', 'output'),
    maxRetries: 3,
    format: 'both',
    stageOverrides: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pdf':
        options.pdf = args[++i] || '';
        break;
      case '--level':
        options.level = args[++i] || 'B';
        break;
      case '--subject':
        options.subject = args[++i] || 'math';
        break;
      case '--profile':
        options.profileId = args[++i];
        break;
      case '--curriculum':
        options.curriculum = args[++i];
        break;
      case '--scope':
        options.scope = args[++i] || 'all';
        break;
      case '--language':
        options.language = args[++i] || 'en';
        break;
      case '--locale':
        options.locale = args[++i] || 'en-IN';
        break;
      case '--widget-category':
        options.widgetCategories.push(args[++i] || '');
        break;
      case '--force':
        options.force = true;
        break;
      case '--llm-provider':
        options.llmProvider = args[++i];
        break;
      case '--llm-model':
        options.llmModel = args[++i];
        break;
      case '--stage-model':
        options.stageOverrides?.push(args[++i] || '');
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--output-dir':
        options.outputDir = args[++i] || options.outputDir;
        break;
      case '--max-retries':
        options.maxRetries = parseInt(args[++i] || '3', 10);
        break;
      case '--format': {
        const formatVal = args[++i] || 'both';
        if (!['md', 'json', 'both'].includes(formatVal)) {
          console.error(`Invalid format: ${formatVal}. Use md, json, or both.`);
          process.exit(1);
        }
        options.format = formatVal as 'md' | 'json' | 'both';
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
OpenEdu Pipeline — Curriculum Generator

Usage: pnpm --filter @open-edu/pipeline curriculum:generate [options]

Options:
  --pdf <path>            Path to the input file (PDF, DOCX, PPTX, Markdown, ZIP) (required)
  --level <code>          Level code (default: B)
  --subject <name>        Subject name (default: math)
  --profile <id>          Curriculum profile (generic, math, science, nios)
  --curriculum <id>       Curriculum adapter (e.g., nios)
  --scope <value>         Scope: all, chapter-index:N, chapter-id:ID, pages:A-B, source-units:id,id
  --language <code>       Content language (default: en)
  --locale <locale>       Locale (default: en-IN)
  --widget-category <id>  Repeatable widget category filter (core, math, science, etc.)
  --force                 Overwrite existing output file
  --llm-provider <name>   LLM provider override (default: from env)
  --llm-model <name>      LLM model override (default: from env)
  --stage-model <spec>    Per-stage LLM override (repeatable; stage=model or stage:field=value)
  --interactive           Enable human-in-the-loop checkpoints
  --dry-run               Validate but don't write files
  --resume                Resume from intermediate artifacts when possible
  --verbose               Detailed logging per stage
  --output-dir <path>     Custom output directory (default: ./output)
  --max-retries <num>     Max retries per concept (default: 3)
  --format <type>         Output format: md, json, both (default: both)
  --help, -h              Show this help message

Examples:
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./textbook.pdf --level B --subject math
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./textbook.pdf --scope chapter-index:1 --profile math --verbose
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./textbook.pdf --stage-model concept_map=gpt-4o --stage-model lesson_blueprint=claude-sonnet-4
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./science.pdf --subject science --profile science
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./lesson.docx --subject english --profile generic
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./slides.pptx --subject biology --profile science
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./archive.zip --subject history --profile generic
`);
}
