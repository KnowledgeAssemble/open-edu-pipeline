import type { Concept } from '../concepts/types.js';
import type { SourceUnit } from '../source/types.js';
import type { CurriculumProfile } from '../profile/types.js';

export function buildBlueprintPrompt(
  concept: Concept,
  sourceUnits: SourceUnit[],
  profile: CurriculumProfile,
): string {
  const teachingStyle = profile.promptContext?.teachingStyle || 'scaffolded discovery';
  const assetRendererTypes = profile.assetRendererTypes.join('", "');

  return `Design a lesson blueprint for teaching this ${profile.subject} concept.

Teaching style: ${teachingStyle}

CONCEPT:
${JSON.stringify(
  {
    conceptId: concept.conceptId,
    label: concept.label,
    kind: concept.kind,
    learningObjective: concept.learningObjective,
    coreIdea: concept.coreIdea,
    difficulty: concept.difficulty,
    representations: concept.representations,
    misconceptionTargets: concept.misconceptionTargets ?? [],
    prerequisites: concept.prerequisites,
    adultContext: concept.adultContext,
    recommendedWidgetCategories: concept.recommendedWidgetCategories,
  },
  null,
  2,
)}

SOURCE EVIDENCE (textbook excerpts):
${JSON.stringify(
  sourceUnits
    .filter((u) => concept.sourceUnitIds.includes(u.id))
    .map((u) => ({ id: u.id, type: u.type, text: u.text.slice(0, 1000) })),
  null,
  2,
)}

AVAILABLE WIDGET CATEGORIES: ${profile.widgetCategories.join(', ')}

Create a lesson blueprint with:
- conceptId, sourceUnitIds (non-empty), objective, priorKnowledge
- representations: "concrete", "visual", "symbolic"
- lessonArc: array of { step, description, durationMinutes (1-20) }.
  Valid steps: hook, observe, worked_example, guided_practice, widget_practice, independent_practice, mastery_check, remediation, extension.
  mastery_check is REQUIRED.
- assetRequests: array of { id, rendererType, parameters, description }.
  rendererType must be one of: ${assetRendererTypes}
- widgetRequests: array of { step, widgetCategory, mode (observe|interactive), description }.
- questionFamilies: types of questions.
- misconceptionTargets.

DO NOT request widget categories not in the available list.
If the concept has "visual" representation, include at least one assetRequest (when renderers are available).

IMPORTANT: All array fields (sourceUnitIds, priorKnowledge, representations, questionFamilies, misconceptionTargets) must be JSON arrays, not comma-separated strings.
Return the blueprint as a single JSON object matching the schema.`;
}
