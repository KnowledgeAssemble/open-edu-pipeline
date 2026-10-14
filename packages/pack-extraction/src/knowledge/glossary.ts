const GLOSSARY_RE = /^\*\*([^*]+)\*\*\s*[—:]\s*(.+)$/;

export function parseGlossaryTerm(line: string): { term: string; definition: string } | null {
  const match = GLOSSARY_RE.exec(line.trim());
  if (!match) return null;
  const term = match[1]?.trim();
  const definition = match[2]?.trim();
  if (!term || !definition) return null;
  return { term, definition };
}
