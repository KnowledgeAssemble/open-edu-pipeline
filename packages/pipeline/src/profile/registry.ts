import type { CurriculumProfile } from './types.js';
import { CurriculumProfileSchema } from './types.js';

const profiles = new Map<string, CurriculumProfile>();

export const GENERIC_PROFILE_ID = 'generic';

export function registerProfile(profile: CurriculumProfile): void {
  CurriculumProfileSchema.parse(profile);
  if (profiles.has(profile.id)) {
    throw new Error(`Profile "${profile.id}" is already registered`);
  }
  profiles.set(profile.id, profile);
}

export function getProfile(id: string): CurriculumProfile | undefined {
  return profiles.get(id);
}

export function listProfiles(): CurriculumProfile[] {
  return [...profiles.values()];
}

export function resolveProfile(params: {
  profileId?: string;
  subject?: string;
  curriculum?: string;
}): CurriculumProfile {
  if (params.profileId) {
    const p = getProfile(params.profileId);
    if (!p) throw new Error(`Profile not found: "${params.profileId}"`);
    return p;
  }
  if (params.curriculum) {
    const byCurriculum = [...profiles.values()].find((p) => p.curriculum === params.curriculum);
    if (byCurriculum) return byCurriculum;
  }
  if (params.subject) {
    const bySubject = [...profiles.values()].find((p) => p.subject === params.subject);
    if (bySubject) return bySubject;
  }
  const generic = getProfile(GENERIC_PROFILE_ID);
  if (generic) return generic;
  throw new Error('No generic profile registered and no matching profile found');
}

export function clearRegistry(): void {
  profiles.clear();
  _builtinsRegistered = false;
}

import { GENERIC_PROFILE } from './builtins/generic.js';
import { NIOS_PROFILE } from './builtins/nios.js';
import { MATH_PROFILE } from './builtins/math.js';
import { SCIENCE_PROFILE } from './builtins/science.js';

let _builtinsRegistered = false;
export function registerBuiltinProfiles(): void {
  if (_builtinsRegistered) return;
  _builtinsRegistered = true;
  registerProfile(GENERIC_PROFILE);
  registerProfile(NIOS_PROFILE);
  registerProfile(MATH_PROFILE);
  registerProfile(SCIENCE_PROFILE);
}

registerBuiltinProfiles();
