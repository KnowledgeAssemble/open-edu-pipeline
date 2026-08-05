import { createLogger } from '../lib/logger.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const cliLogger = createLogger({ scope: 'pipeline:cli' });

export function info(msg: string): void {
  cliLogger.info(msg);
  console.log(msg);
}

export function success(msg: string): void {
  cliLogger.info(msg);
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function warn(msg: string): void {
  cliLogger.warn(msg);
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

export function error(msg: string): void {
  cliLogger.error(msg);
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function verbose(msg: string, isVerbose: boolean): void {
  if (isVerbose) {
    cliLogger.debug(msg);
    console.log(`${DIM}${msg}${RESET}`);
  }
}

export function header(title: string): void {
  cliLogger.info(title);
  console.log(`\n${BOLD}${CYAN}${title}${RESET}`);
}

export function divider(): void {
  console.log('='.repeat(50));
}

export function reportTable(
  metrics: { label: string; value: string | number; status: string }[],
): void {
  const labelPad = Math.max(...metrics.map((m) => m.label.length));
  const valuePad = Math.max(...metrics.map((m) => String(m.value).length));

  const width = Math.max(0, labelPad + valuePad + 12);
  console.log(`\n${'─'.repeat(width)}`);
  console.log(
    `${BOLD}${' '.repeat(2)}Metric${' '.repeat(Math.max(0, labelPad - 6))}${' '.repeat(2)}Count${' '.repeat(Math.max(0, valuePad - 5))}Status${RESET}`,
  );
  console.log(`${'─'.repeat(width)}`);

  for (const m of metrics) {
    const statusIcon =
      m.status === 'ok'
        ? `${GREEN}✅${RESET}`
        : m.status === 'warn'
          ? `${YELLOW}ℹ️${RESET}`
          : `${RED}❌${RESET}`;
    console.log(
      `  ${m.label.padEnd(labelPad)}  ${String(m.value).padEnd(valuePad)}  ${statusIcon}`,
    );
  }

  console.log(`${'─'.repeat(width)}\n`);

  cliLogger.info('pipeline report', { metrics });
}
