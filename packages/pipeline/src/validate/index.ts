import type {
  GeneratedConcept,
  GeneratedActivity,
  ConceptActivityPair,
  ValidatedOutput,
} from '../types.js';
import { ACTIVITY_STEPS } from '../types.js';

export interface ValidationError {
  conceptId: string;
  message: string;
}

export function validateConceptPair(
  concept: GeneratedConcept,
  activities: GeneratedActivity[],
): { errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!concept.conceptId || !/^[a-z]+[a-z0-9_]*$/.test(concept.conceptId)) {
    errors.push({
      conceptId: concept.conceptId,
      message: `Invalid conceptId format: "${concept.conceptId}". Must be lowercase with underscores.`,
    });
  }

  if (!concept.learningObjective || concept.learningObjective.length < 10) {
    errors.push({
      conceptId: concept.conceptId,
      message: `learningObjective must be at least 10 characters, got "${concept.learningObjective}"`,
    });
  }

  if (!concept.coreIdea) {
    errors.push({
      conceptId: concept.conceptId,
      message: 'coreIdea is required',
    });
  }

  if (!concept.examples || concept.examples.length < 1) {
    errors.push({
      conceptId: concept.conceptId,
      message: 'At least one example is required',
    });
  }

  if (concept.masteryCriteria < 0 || concept.masteryCriteria > 1) {
    errors.push({
      conceptId: concept.conceptId,
      message: `masteryCriteria must be between 0 and 1, got ${concept.masteryCriteria}`,
    });
  }

  const stepNames = activities.map((a) => a.step);
  for (const required of ACTIVITY_STEPS) {
    if (!stepNames.includes(required)) {
      errors.push({
        conceptId: concept.conceptId,
        message: `Missing required activity step: "${required}"`,
      });
    }
  }

  if (activities.length !== 5) {
    errors.push({
      conceptId: concept.conceptId,
      message: `Must have exactly 5 activities, got ${activities.length}`,
    });
  }

  for (let i = 0; i < activities.length; i++) {
    const act = activities[i]!;
    if (act.order !== i + 1) {
      errors.push({
        conceptId: concept.conceptId,
        message: `Activity at index ${i} has order ${act.order}, expected ${i + 1}`,
      });
    }

    if (!act.courseSpecType) {
      errors.push({
        conceptId: concept.conceptId,
        message: `Activity at index ${i} is missing courseSpecType`,
      });
    }

    if (!act.content || typeof act.content !== 'object') {
      errors.push({
        conceptId: concept.conceptId,
        message: `Activity at index ${i} must have a content object`,
      });
    }

    if (act.step === 'mastery_check') {
      const questions = act.content.questions;
      if (!questions || questions.length === 0) {
        errors.push({
          conceptId: concept.conceptId,
          message: `mastery_check must have at least one question`,
        });
      }
    }
  }

  return { errors, warnings };
}

export function validateAll(pairs: ConceptActivityPair[]): ValidatedOutput {
  const passed: ConceptActivityPair[] = [];
  const failed: { concept: GeneratedConcept; errors: string[]; retries: number }[] = [];
  const warnings: { conceptId: string; warnings: string[] }[] = [];

  for (const pair of pairs) {
    const result = validateConceptPair(pair.concept, pair.activities);

    if (result.errors.length > 0) {
      failed.push({
        concept: pair.concept,
        errors: result.errors.map((e) => e.message),
        retries: 0,
      });
    } else {
      passed.push(pair);
    }

    if (result.warnings.length > 0) {
      warnings.push({
        conceptId: pair.concept.conceptId,
        warnings: result.warnings,
      });
    }
  }

  return { passed, failed, warnings };
}

export async function validateWithRetry(
  llm: {
    regenerateConcept?: (
      conceptId: string,
      errors: string[],
    ) => Promise<ConceptActivityPair | null>;
  },
  pairs: ConceptActivityPair[],
  maxRetries: number,
): Promise<ValidatedOutput> {
  let currentPairs = [...pairs];
  const allWarnings: { conceptId: string; warnings: string[] }[] = [];

  for (let retry = 0; retry <= maxRetries; retry++) {
    const result = validateAll(currentPairs);
    allWarnings.push(...result.warnings);

    if (result.failed.length === 0 || !llm.regenerateConcept) {
      return {
        passed: result.passed,
        failed: result.failed.map((f) => ({
          ...f,
          retries: Math.min(retry, maxRetries),
        })),
        warnings: allWarnings,
      };
    }

    const fixedPairs: ConceptActivityPair[] = [...result.passed];
    const stillFailed: { concept: GeneratedConcept; errors: string[]; retries: number }[] = [];

    for (const failed of result.failed) {
      try {
        const fixed = await llm.regenerateConcept(failed.concept.conceptId, failed.errors);
        if (fixed) {
          fixedPairs.push(fixed);
        } else {
          stillFailed.push({ ...failed, retries: retry + 1 });
        }
      } catch {
        stillFailed.push({ ...failed, retries: retry + 1 });
      }
    }

    currentPairs = fixedPairs;

    if (stillFailed.length === 0) {
      return {
        passed: fixedPairs,
        failed: [],
        warnings: allWarnings,
      };
    }

    if (retry < maxRetries) {
      currentPairs = fixedPairs;
    } else {
      return {
        passed: fixedPairs,
        failed: stillFailed,
        warnings: allWarnings,
      };
    }
  }

  throw new Error('validateWithRetry reached unreachable state');
}
