import type { CurriculumProfile } from '../types.js';

export const SCIENCE_PROFILE: CurriculumProfile = {
  id: 'science',
  subject: 'science',
  locale: 'en-IN',
  language: 'en',
  sourceTaxonomy: {
    lessonLabels: ['Lesson', 'Chapter', 'Unit', 'Topic'],
    sectionLabels: ['Section'],
    objectiveLabels: ['Learning Objectives', 'Objectives', 'Goals'],
    definitionLabels: ['Definition', 'Key Terms', 'Key Concepts'],
    exampleLabels: ['Example', 'Case Study'],
    exerciseLabels: ['Exercise', 'Practice', 'Questions', 'Activity'],
    reviewLabels: ['Review', 'Summary', 'Key Points'],
    assessmentLabels: ['Test', 'Assessment', 'Quiz'],
  },
  conceptKinds: ['knowledge', 'process', 'classification', 'application'],
  representations: ['visual', 'symbolic', 'concrete'],
  questionFamilies: [
    'direct_question',
    'multiple_choice',
    'fill_blank',
    'short_answer',
    'classification',
    'process_description',
  ],
  widgetCategories: ['core', 'science'],
  assetRendererTypes: [],
  validatorIds: ['science'],
  promptContext: {
    teachingStyle: 'observation -> classification -> explanation',
  },
};
