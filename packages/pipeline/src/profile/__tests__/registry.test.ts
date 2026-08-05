import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerProfile,
  getProfile,
  listProfiles,
  resolveProfile,
  clearRegistry,
  registerBuiltinProfiles,
  GENERIC_PROFILE_ID,
} from '../registry.js';
import { CurriculumProfileSchema, type CurriculumProfile } from '../types.js';

function makeProfile(overrides: Partial<CurriculumProfile> = {}): CurriculumProfile {
  return {
    id: 'test-profile',
    subject: 'test',
    locale: 'en-IN',
    language: 'en',
    sourceTaxonomy: {
      lessonLabels: ['Lesson'],
      sectionLabels: ['Section'],
      objectiveLabels: ['Objectives'],
      definitionLabels: ['Definition'],
      exampleLabels: ['Example'],
      exerciseLabels: ['Exercise'],
      reviewLabels: ['Review'],
      assessmentLabels: ['Test'],
    },
    conceptKinds: ['knowledge', 'skill'],
    representations: ['concrete', 'visual'],
    questionFamilies: ['direct_question'],
    widgetCategories: ['core'],
    assetRendererTypes: [],
    validatorIds: [],
    promptContext: {},
    ...overrides,
  };
}

describe('Profile Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves a profile', () => {
    const profile = makeProfile({ id: 'my-profile' });
    registerProfile(profile);
    expect(getProfile('my-profile')).toBeDefined();
    expect(getProfile('my-profile')!.id).toBe('my-profile');
  });

  it('throws on duplicate ID', () => {
    const profile = makeProfile({ id: 'dup' });
    registerProfile(profile);
    expect(() => registerProfile(profile)).toThrow('already registered');
  });

  it('returns undefined for unknown ID', () => {
    expect(getProfile('nonexistent')).toBeUndefined();
  });

  it('resolveProfile with explicit profile ID works', () => {
    registerProfile(makeProfile({ id: 'custom' }));
    const resolved = resolveProfile({ profileId: 'custom' });
    expect(resolved.id).toBe('custom');
  });

  it('resolveProfile falls back to subject match', () => {
    registerProfile(makeProfile({ id: 'math', subject: 'mathematics' }));
    const resolved = resolveProfile({ subject: 'mathematics' });
    expect(resolved.id).toBe('math');
  });

  it('resolveProfile falls back to generic when no subject match', () => {
    registerProfile(makeProfile({ id: GENERIC_PROFILE_ID, subject: 'generic' }));
    const resolved = resolveProfile({ subject: 'unknown-subject' });
    expect(resolved.id).toBe(GENERIC_PROFILE_ID);
  });

  it('resolveProfile throws if no generic and no match', () => {
    expect(() => resolveProfile({ subject: 'unknown' })).toThrow();
  });

  it('clearRegistry clears all', () => {
    registerProfile(makeProfile({ id: 'a' }));
    registerProfile(makeProfile({ id: 'b' }));
    clearRegistry();
    expect(getProfile('a')).toBeUndefined();
    expect(getProfile('b')).toBeUndefined();
  });

  it('CurriculumProfileSchema rejects empty id', () => {
    const result = CurriculumProfileSchema.safeParse(makeProfile({ id: '' }));
    expect(result.success).toBe(false);
  });

  it('CurriculumProfileSchema rejects duplicate widget categories', () => {
    const profile = makeProfile({ widgetCategories: ['core', 'core'] });
    const result = CurriculumProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('CurriculumProfileSchema rejects invalid locale format', () => {
    const profile = makeProfile({ locale: 'en' });
    const result = CurriculumProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('listProfiles returns all registered', () => {
    registerProfile(makeProfile({ id: 'a' }));
    registerProfile(makeProfile({ id: 'b' }));
    const all = listProfiles();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });
});

describe('Built-in Profiles', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinProfiles();
  });

  it('generic profile is registered', () => {
    const p = getProfile('generic');
    expect(p).toBeDefined();
    expect(p!.subject).toBe('generic');
  });

  it('math profile is registered', () => {
    const p = getProfile('math');
    expect(p).toBeDefined();
    expect(p!.subject).toBe('mathematics');
  });

  it('science profile is registered', () => {
    const p = getProfile('science');
    expect(p).toBeDefined();
    expect(p!.subject).toBe('science');
  });

  it('nios profile is registered', () => {
    const p = getProfile('nios');
    expect(p).toBeDefined();
    expect(p!.curriculum).toBe('nios');
  });

  it('resolve with subject: mathematics returns math profile', () => {
    const p = resolveProfile({ subject: 'mathematics' });
    expect(p.id).toBe('math');
  });

  it('resolve with subject: science returns science profile', () => {
    const p = resolveProfile({ subject: 'science' });
    expect(p.id).toBe('science');
  });

  it('resolve with curriculum: nios returns nios profile', () => {
    const p = resolveProfile({ curriculum: 'nios' });
    expect(p.id).toBe('nios');
  });

  it('resolve with unknown subject returns generic', () => {
    const p = resolveProfile({ subject: 'history' });
    expect(p.id).toBe('generic');
  });

  it('generic profile does not have math-only renderers', () => {
    const p = getProfile('generic')!;
    expect(p.assetRendererTypes).toEqual([]);
    expect(p.validatorIds).toEqual([]);
  });

  it('each built-in profile passes schema validation', () => {
    for (const p of listProfiles()) {
      const result = CurriculumProfileSchema.safeParse(p);
      expect(result.success).toBe(true);
    }
  });
});
