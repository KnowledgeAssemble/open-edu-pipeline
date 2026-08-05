import type { CurriculumProfile } from '../types.js';

export const NIOS_PROFILE: CurriculumProfile = {
  id: 'nios',
  subject: 'nios',
  curriculum: 'nios',
  locale: 'en-IN',
  language: 'en',
  sourceTaxonomy: {
    lessonLabels: ['Lesson', 'पाठ'],
    sectionLabels: ['Section'],
    objectiveLabels: ['LEARNING OUTCOMES', 'Objectives', 'OBJECTIVES', 'सीखने के परिणाम'],
    definitionLabels: ['Definition', 'Key Terms'],
    exampleLabels: ['Example', 'उदाहरण'],
    exerciseLabels: [
      'Let us see what you have learnt',
      'Exercise',
      'अभ्यास',
      'आइए देखें आपने क्या सीखा',
    ],
    reviewLabels: ['REVIEW', 'Review', 'पुनरावृत्ति', 'What have you learnt', 'आपने क्या सीखा'],
    assessmentLabels: ['TEST', 'Test', 'परीक्षा', 'Assessment', 'मूल्यांकन'],
  },
  conceptKinds: ['knowledge', 'skill', 'procedure', 'application'],
  representations: ['concrete', 'visual', 'symbolic'],
  questionFamilies: ['direct_question', 'multiple_choice', 'fill_blank', 'short_answer'],
  widgetCategories: ['core'],
  assetRendererTypes: [],
  validatorIds: [],
  promptContext: {
    chapterStartPhrase: 'From this lesson, you will learn',
    teachingStyle: 'scaffolded discovery',
  },
};
