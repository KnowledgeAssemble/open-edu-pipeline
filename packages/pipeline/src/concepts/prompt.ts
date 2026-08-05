import type { SourceUnit } from '../source/types.js';
import type { CurriculumProfile } from '../profile/types.js';

export function buildConceptMapPrompt(
  sourceUnits: SourceUnit[],
  subject: string,
  profile: CurriculumProfile,
): string {
  const inputUnits = sourceUnits.map((u) => ({
    unitId: u.id,
    type: u.type,
    pageStart: u.location.pageStart,
    text: u.text.slice(0, 1500),
  }));
  const unitsJson = JSON.stringify(inputUnits, null, 2);

  const validKinds = profile.conceptKinds.join('", "');
  const validReps = profile.representations.join('", "');
  const includeAdultContext = profile.promptContext?.includeAdultContext === true;
  const teachingStyle = profile.promptContext?.teachingStyle || 'scaffolded discovery';

  return `You are designing a concept map for a ${subject} lesson.

Teaching style: ${teachingStyle}

Below are extracted source units from the textbook.

Source units:
${unitsJson}

Generate a list of discrete, teachable concepts. Rules:
1. Each concept MUST reference at least one source unit ID as evidence.
2. Concepts MUST cover every objective and assessment in the source material.
3. Create ONE concept per independently teachable skill.
4. Never generate a concept without citing source evidence via sourceUnitIds.
5. conceptId must match pattern: lowercase letters, digits, underscores.
6. Do NOT generate more than 15 concepts per lesson.

For each concept, provide:
- conceptId, label, kind (one of: "${validKinds}")
- sourceUnitIds: array of source unit IDs
- learningObjective, coreIdea, difficulty, masteryThreshold
- prerequisites: conceptIds of prerequisites (empty array if none)
- representations: at least one of "${validReps}"
- exerciseFamilies, misconceptionTargets
${includeAdultContext ? '- adultContext: real-world application (optional)' : ''}
- recommendedWidgetCategories
- estimatedMinutes (5-60)

Return a JSON object with a "concepts" array.`;
}
