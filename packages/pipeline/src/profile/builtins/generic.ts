import type { CurriculumProfile } from '../types.js';

export const GENERIC_PROFILE: CurriculumProfile = {
  id: 'generic',
  subject: 'generic',
  locale: 'en-IN',
  language: 'en',
  sourceTaxonomy: {
    lessonLabels: ['Lesson', 'Chapter', 'Unit', 'Module'],
    sectionLabels: ['Section'],
    objectiveLabels: ['Learning Objectives', 'Objectives', 'Goals'],
    definitionLabels: ['Definition', 'Key Terms'],
    exampleLabels: ['Example'],
    exerciseLabels: ['Exercise', 'Practice', 'Questions'],
    reviewLabels: ['Review', 'Summary', 'Key Points'],
    assessmentLabels: ['Test', 'Assessment', 'Quiz'],
  },
  conceptKinds: ['knowledge', 'skill', 'procedure', 'application'],
  representations: ['concrete', 'visual', 'symbolic'],
  questionFamilies: ['direct_question', 'multiple_choice', 'fill_blank', 'short_answer'],
  widgetCategories: ['core'],
  assetRendererTypes: [],
  validatorIds: [],
  promptContext: {
    teachingStyle: 'scaffolded discovery',
    activityStructure: 'observe -> practice -> assess -> reflect',
  },
};
