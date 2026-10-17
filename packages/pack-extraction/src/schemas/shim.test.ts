import { describe, it, expect } from 'vitest';
import * as installed from '@open-edu/packs';
import * as shim from './index.js';

// Guards against reintroducing a hand-maintained local mirror: the pipeline's schema surface
// must be the installed @open-edu/packs package, not a copy of it.
describe('schemas shim', () => {
  it('re-exports the installed @open-edu/packs schemas by identity', () => {
    expect(shim.PackManifestSchema).toBe(installed.PackManifestSchema);
    expect(shim.ConceptSchema).toBe(installed.ConceptSchema);
    expect(shim.ConceptSourceSchema).toBe(installed.ConceptSourceSchema);
    expect(shim.ConceptRefSchema).toBe(installed.ConceptRefSchema);
    expect(shim.ObjectiveSchema).toBe(installed.ObjectiveSchema);
    expect(shim.CurriculumUnitSchema).toBe(installed.CurriculumUnitSchema);
    expect(shim.CurriculumSchema).toBe(installed.CurriculumSchema);
    expect(shim.LearningIntent).toBe(installed.LearningIntent);
    expect(shim.LEARNING_INTENTS).toBe(installed.LEARNING_INTENTS);
  });
});
