// Single source of truth: the published @open-edu/packs package (open-edu repo).
// This module re-exports the canonical pack schemas so pipeline code keeps a stable
// import path while conforming exactly to what Course Creator Studio's loader/resolver
// accept. Do not redeclare these schemas locally — a conformance test asserts the
// re-exports are the installed package.
import type { z } from 'zod';
import type { CurriculumUnitSchema } from '@open-edu/packs';

export {
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  PackTypeSchema,
  PackManifestSchema,
  ConceptSourceSchema,
  ConceptSchema,
  ConceptRefSchema,
  ObjectiveSchema,
  CurriculumUnitSchema,
  CurriculumSchema,
  LEARNING_INTENTS,
  LearningIntent,
} from '@open-edu/packs';

export type {
  PackType,
  PackManifest,
  ConceptSource,
  Concept,
  ConceptRef,
  Objective,
  Curriculum,
} from '@open-edu/packs';

/** @open-edu/packs exports the schema but not this derived type. */
export type CurriculumUnit = z.infer<typeof CurriculumUnitSchema>;
