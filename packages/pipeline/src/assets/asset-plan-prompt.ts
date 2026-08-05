import type { LessonBlueprint } from '../blueprint/types.js';
import type { CurriculumProfile } from '../profile/types.js';

export function buildAssetPlanPrompt(
  blueprints: LessonBlueprint[],
  profile: CurriculumProfile,
): string {
  const bpSummary = blueprints.map((bp) => ({
    conceptId: bp.conceptId,
    assetRequests: bp.assetRequests,
    representations: bp.representations,
  }));

  const rendererList = profile.assetRendererTypes.join('", "');

  return `You are planning visual assets for a ${profile.subject} course.

Each lesson blueprint below has asset requests describing the visual aids needed.

Blueprints:
${JSON.stringify(bpSummary, null, 2)}

For each unique asset request across all blueprints, generate an asset manifest entry with:
- id: unique identifier
- filename: "{id}.svg"
- mediaType: "image/svg+xml"
- altText: accessible description of the visual
- caption: optional caption shown below the image
- rendererType: one of: ${rendererList}
- conceptIds: array of concept IDs this asset supports
- sourceUnitIds: array of source unit IDs referenced
- parameters: renderer-specific numeric/string parameters

Return a JSON object with an "assets" array.`;
}
