import { describe, it, expect } from 'vitest';
import { COURSE_SPEC_TYPES } from '../types.js';

describe('course spec types', () => {
  it('includes widget', () => {
    expect(COURSE_SPEC_TYPES).toContain('widget');
  });
});
