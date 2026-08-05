import type { SourceUnit } from '../source/types.js';
import type { Concept } from '../concepts/types.js';
import type { LessonBlueprint } from '../blueprint/types.js';
import type { AssetManifestEntry } from '../assets/types.js';
import type { CoverageLedger, CoverageEntry, CoverageStatus } from './types.js';

export function buildCoverageLedger(
  sourceUnits: SourceUnit[],
  concepts: Concept[],
  blueprints: LessonBlueprint[],
  assets: AssetManifestEntry[],
  conceptActivityMap: Map<string, string[]>,
): CoverageLedger {
  const conceptSourceMap = new Map<string, Set<string>>();
  for (const c of concepts) {
    conceptSourceMap.set(c.conceptId, new Set(c.sourceUnitIds));
  }

  const entries: CoverageEntry[] = sourceUnits.map((unit) => {
    const conceptIds = concepts
      .filter((c) => c.sourceUnitIds.includes(unit.id))
      .map((c) => c.conceptId);
    const blueprintIds = blueprints
      .filter((b) => b.sourceUnitIds.includes(unit.id))
      .map((b) => b.conceptId);
    const activityIds = conceptIds.flatMap((cId) => conceptActivityMap.get(cId) || []);
    const assetIds = assets.filter((a) => a.sourceUnitIds.includes(unit.id)).map((a) => a.id);

    let status: CoverageStatus = 'uncovered';
    if (!unit.requiredCoverage) {
      status = 'not_applicable';
    } else if (conceptIds.length > 0 && activityIds.length > 0) {
      status = 'covered';
    } else if (conceptIds.length > 0) {
      status = 'partially_covered';
    }

    return {
      sourceUnitId: unit.id,
      sourceType: unit.type,
      concepts: conceptIds,
      blueprints: blueprintIds,
      activities: activityIds,
      assets: assetIds,
      status,
    };
  });

  const required = sourceUnits.filter((u) => u.requiredCoverage);
  const coveredRequired = entries.filter(
    (e) =>
      e.status === 'covered' && sourceUnits.find((u) => u.id === e.sourceUnitId)?.requiredCoverage,
  ).length;
  const objectives = sourceUnits.filter((u) => u.type === 'objective');
  const coveredObjectives = entries.filter(
    (e) =>
      e.status === 'covered' &&
      sourceUnits.find((u) => u.id === e.sourceUnitId)?.type === 'objective',
  ).length;
  const examples = sourceUnits.filter((u) => u.type === 'worked_example');
  const coveredExamples = entries.filter(
    (e) =>
      e.status === 'covered' &&
      sourceUnits.find((u) => u.id === e.sourceUnitId)?.type === 'worked_example',
  ).length;
  const exercises = sourceUnits.filter((u) => u.type === 'exercise');
  const coveredExercises = entries.filter(
    (e) =>
      e.status === 'covered' &&
      sourceUnits.find((u) => u.id === e.sourceUnitId)?.type === 'exercise',
  ).length;
  const assessments = sourceUnits.filter((u) => u.type === 'assessment');
  const coveredAssessments = entries.filter(
    (e) =>
      e.status === 'covered' &&
      sourceUnits.find((u) => u.id === e.sourceUnitId)?.type === 'assessment',
  ).length;

  return {
    documentId: '',
    totalSourceUnits: sourceUnits.length,
    requiredSourceUnits: required.length,
    entries,
    summary: {
      coveredRequired,
      percentRequiredCovered:
        required.length > 0 ? Math.round((coveredRequired / required.length) * 100) : 100,
      percentObjectiveCovered:
        objectives.length > 0 ? Math.round((coveredObjectives / objectives.length) * 100) : 100,
      percentWorkedExampleCovered:
        examples.length > 0 ? Math.round((coveredExamples / examples.length) * 100) : 100,
      percentExerciseCovered:
        exercises.length > 0 ? Math.round((coveredExercises / exercises.length) * 100) : 100,
      percentAssessmentCovered:
        assessments.length > 0 ? Math.round((coveredAssessments / assessments.length) * 100) : 100,
      conceptCount: concepts.length,
      activityCount: entries.reduce((sum, e) => sum + e.activities.length, 0),
      assetCount: assets.length,
    },
  };
}
