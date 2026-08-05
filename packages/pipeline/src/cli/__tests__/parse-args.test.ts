import { describe, it, expect } from 'vitest';
import { parseArgs } from '../parse-args.js';
import { parseStageOverride } from '../../config/config.js';

describe('parseArgs', () => {
  it('parses --stage-model into stageOverrides (repeatable)', () => {
    const opts = parseArgs([
      '--pdf',
      'book.pdf',
      '--stage-model',
      'concept_map=gpt-4o',
      '--stage-model',
      'lesson_blueprint=claude-sonnet-4',
    ]);
    expect(opts.stageOverrides).toEqual(['concept_map=gpt-4o', 'lesson_blueprint=claude-sonnet-4']);
  });

  it('parses --stage-model stage:field=value form', () => {
    const opts = parseArgs([
      '--pdf',
      'book.pdf',
      '--stage-model',
      'concept_map:provider=openrouter',
    ]);
    expect(opts.stageOverrides).toEqual(['concept_map:provider=openrouter']);
  });

  it('defaults stageOverrides to empty array', () => {
    const opts = parseArgs(['--pdf', 'book.pdf']);
    expect(opts.stageOverrides).toEqual([]);
  });

  it('round-trips CLI stage overrides through parseStageOverride', () => {
    const opts = parseArgs(['--pdf', 'book.pdf', '--stage-model', 'concept_map=gpt-4o']);
    const overrides = (opts.stageOverrides || []).map(parseStageOverride);
    expect(overrides).toEqual([{ stage: 'concept_map', model: 'gpt-4o' }]);
  });

  it('preserves other options when --stage-model is present', () => {
    const opts = parseArgs([
      '--pdf',
      'book.pdf',
      '--level',
      'C',
      '--subject',
      'science',
      '--stage-model',
      'review=gpt-4o',
      '--verbose',
    ]);
    expect(opts.pdf).toBe('book.pdf');
    expect(opts.level).toBe('C');
    expect(opts.subject).toBe('science');
    expect(opts.verbose).toBe(true);
    expect(opts.stageOverrides).toEqual(['review=gpt-4o']);
  });
});
