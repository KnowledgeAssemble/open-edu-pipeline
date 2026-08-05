import type { CurriculumProfile } from '../profile/types.js';
import type { Concept } from '../concepts/types.js';
import type { LessonBlueprint } from '../blueprint/types.js';
import type { GeneratedActivity } from '../types.js';
import type { AssetManifestEntry } from '../assets/types.js';
import type { SourceUnit } from '../source/types.js';

export interface ValidationContext {
  concepts: Concept[];
  blueprints: LessonBlueprint[];
  activities: GeneratedActivity[];
  assets: AssetManifestEntry[];
  sourceUnits: SourceUnit[];
  profile: CurriculumProfile;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  source: string;
}

export interface SubjectValidator {
  id: string;
  supports(profile: CurriculumProfile): boolean;
  validateConcepts(ctx: ValidationContext): ValidationIssue[];
  validateActivities(ctx: ValidationContext): ValidationIssue[];
}

const validators = new Map<string, SubjectValidator>();

export function registerValidator(v: SubjectValidator): void {
  if (validators.has(v.id)) {
    // Allow re-registration after clear for testing
    validators.delete(v.id);
  }
  validators.set(v.id, v);
}

export function getValidator(id: string): SubjectValidator | undefined {
  return validators.get(id);
}

export function listValidators(): SubjectValidator[] {
  return [...validators.values()];
}

export function getValidatorsForProfile(profile: CurriculumProfile): SubjectValidator[] {
  const result: SubjectValidator[] = [];
  for (const v of validators.values()) {
    if (v.supports(profile)) {
      result.push(v);
    }
  }
  return result;
}

export function clearValidatorRegistry(): void {
  validators.clear();
}

export function registerBuiltinValidators(): void {
  registerValidator({
    id: 'structure',
    supports: () => true,
    validateConcepts: (ctx) => {
      const issues: ValidationIssue[] = [];
      const coveredIds = new Set(ctx.concepts.flatMap((c) => c.sourceUnitIds));
      for (const unit of ctx.sourceUnits) {
        if (unit.requiredCoverage && !coveredIds.has(unit.id)) {
          issues.push({
            id: `uncovered-${unit.id}`,
            severity: 'warning',
            message: `Required source unit "${unit.id}" (${unit.type}) is not covered by any concept`,
            source: 'structure',
          });
        }
      }
      return issues;
    },
    validateActivities: (ctx) => {
      const issues: ValidationIssue[] = [];
      for (const concept of ctx.concepts) {
        const hasBlueprint = ctx.blueprints.some((b) => b.conceptId === concept.conceptId);
        if (!hasBlueprint) {
          issues.push({
            id: `no-blueprint-${concept.conceptId}`,
            severity: 'warning',
            message: `Concept "${concept.conceptId}" has no blueprint`,
            source: 'structure',
          });
        }
      }
      return issues;
    },
  });
}

registerBuiltinValidators();
