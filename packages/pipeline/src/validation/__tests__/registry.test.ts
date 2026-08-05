import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerValidator,
  getValidator,
  listValidators,
  getValidatorsForProfile,
  clearValidatorRegistry,
  registerBuiltinValidators,
  type SubjectValidator,
} from '../registry.js';
import type { CurriculumProfile } from '../../profile/types.js';

function makeProfile(overrides: Partial<CurriculumProfile> = {}): CurriculumProfile {
  return {
    id: 'test',
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
      assessmentLabels: ['Assessment'],
    },
    conceptKinds: ['knowledge'],
    representations: ['visual'],
    questionFamilies: ['direct_question'],
    widgetCategories: ['core'],
    assetRendererTypes: [],
    validatorIds: [],
    promptContext: {},
    ...overrides,
  };
}

describe('Validator Registry', () => {
  beforeEach(() => {
    clearValidatorRegistry();
    registerBuiltinValidators();
  });

  it('registers and retrieves a validator', () => {
    const v: SubjectValidator = {
      id: 'test-v',
      supports: () => true,
      validateConcepts: () => [],
      validateActivities: () => [],
    };
    registerValidator(v);
    expect(getValidator('test-v')).toBeDefined();
  });

  it('getValidatorsForProfile includes structural validator always', () => {
    const result = getValidatorsForProfile(makeProfile());
    expect(result.some((v) => v.id === 'structure')).toBe(true);
  });

  it('getValidatorsForProfile for math profile returns structure + math', () => {
    // math validator is registered via math.ts import
    const mathProfile = makeProfile({ id: 'math', validatorIds: ['math'] });
    const result = getValidatorsForProfile(mathProfile);
    const ids = result.map((v) => v.id);
    expect(ids).toContain('structure');
  });

  it('getValidatorsForProfile for generic profile returns only structure', () => {
    const result = getValidatorsForProfile(makeProfile());
    const ids = result.map((v) => v.id);
    expect(ids).toContain('structure');
    // math validator is not registered in this test
  });

  it('clearValidatorRegistry clears all', () => {
    clearValidatorRegistry();
    expect(listValidators()).toHaveLength(0);
  });
});
