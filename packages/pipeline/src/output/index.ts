import { writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GeneratedActivity, ConceptActivityPair, MCQQuestion } from '../types.js';

interface ChapterGroup {
  chapterCode: string;
  chapterName: string;
  chapterNumber: number;
  concepts: ConceptActivityPair[];
}

function escapeYamlValue(value: string): string {
  if (/[\]{},"':#\n[]/.test(value) || value.includes('  ')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function generateFrontmatter(pairs: ConceptActivityPair[]): string {
  const first = pairs[0]?.concept;
  const estimatedHours =
    pairs.reduce((sum, p) => sum + (p.concept.estimatedDuration || 15), 0) / 60;

  const difficulty = pairs.some((p) => p.concept.difficulty === 'advanced')
    ? 'advanced'
    : pairs.some((p) => p.concept.difficulty === 'intermediate')
      ? 'intermediate'
      : 'beginner';

  const title = first?.chapterName
    ? `${first.chapterName} — Auto-generated Course`
    : 'Auto-generated Course';

  return [
    '---',
    `title: ${escapeYamlValue(title)}`,
    `description: ${escapeYamlValue(`Auto-generated from ${pairs.length} concepts`)}`,
    'author: OpenEdu Pipeline',
    'version: 1.0.0',
    `difficulty: ${difficulty}`,
    `estimatedHours: ${Math.max(1, Math.round(estimatedHours))}`,
    'generated: true',
    '---',
    '',
  ].join('\n');
}

function groupByChapter(pairs: ConceptActivityPair[]): ChapterGroup[] {
  const chapters = new Map<string, ChapterGroup>();

  for (const pair of pairs) {
    const code = pair.concept.chapterCode;
    if (!chapters.has(code)) {
      chapters.set(code, {
        chapterCode: code,
        chapterName: pair.concept.chapterName,
        chapterNumber: parseInt(code.replace(/[^0-9]/g, '')) || 0,
        concepts: [],
      });
    }
    chapters.get(code)!.concepts.push(pair);
  }

  return Array.from(chapters.values()).sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function renderModule(group: ChapterGroup, moduleIndex: number): string {
  const lines: string[] = [];

  const moduleNum = moduleIndex + 1;
  const moduleTitle = `${group.chapterName}`;
  lines.push(`# Module ${moduleNum}: ${moduleTitle}`);
  lines.push('');

  for (let i = 0; i < group.concepts.length; i++) {
    const pair = group.concepts[i]!;
    const lessonNum = moduleNum * 100 + i + 1;
    const lessonLines = renderLesson(pair, lessonNum);
    lines.push(...lessonLines);
  }

  return lines.join('\n');
}

function renderLesson(pair: ConceptActivityPair, lessonNum: number): string[] {
  const lines: string[] = [];
  const { concept, activities } = pair;

  const lessonTitle = `${concept.learningObjective}`;
  lines.push(`## Lesson ${lessonNum}: ${lessonTitle}`);
  lines.push('');

  if (concept.learningObjective) {
    lines.push('**Objectives:**');
    lines.push('');
    lines.push(`- ${concept.learningObjective}`);
    lines.push('');
  }

  lines.push(concept.coreIdea);
  lines.push('');

  if (concept.examples.length > 0) {
    for (const example of concept.examples) {
      lines.push(`- ${example}`);
    }
    lines.push('');
  }

  if (concept.misconceptions.length > 0) {
    lines.push('**Common Misconceptions:**');
    for (const mc of concept.misconceptions) {
      lines.push(`- ${mc}`);
    }
    lines.push('');
  }

  if (concept.estimatedDuration) {
    lines.push(`*Estimated time: ${concept.estimatedDuration} minutes*`);
    lines.push('');
  }

  for (const activity of activities) {
    const activityLines = renderActivity(activity, pair.concept.conceptId);
    lines.push(...activityLines);
  }

  return lines;
}

function renderActivity(activity: GeneratedActivity, conceptId?: string): string[] {
  const lines: string[] = [];

  const stepLabels: Record<string, string> = {
    observe: 'Observe',
    guided_practice: 'Guided Practice',
    independent_practice: 'Independent Practice',
    mastery_check: 'Mastery Check',
    positive_completion: 'Congratulations',
  };

  if (activity.step === 'mastery_check') {
    const label = activity.content.description || 'Mastery Check';
    const quizId = conceptId ? `${conceptId}-mastery-check` : 'quiz-mastery-check';
    lines.push(`### Quiz: ${label} (${quizId})`);
    lines.push('');

    const questions = activity.content.questions || [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      lines.push(`${i + 1}. ${q.question}`);
      lines.push('');
      for (let j = 0; j < q.options.length; j++) {
        const prefix = j === q.correctIndex ? '[x]' : '[ ]';
        lines.push(`- ${prefix} ${q.options[j]}`);
      }
      lines.push('');
    }
  } else if (activity.courseSpecType === 'reflection') {
    const label = activity.content.description || 'Congratulations';
    lines.push(`### Activity: Reflection`);
    lines.push('');
    if (label) {
      lines.push(`**${label}**`);
      lines.push('');
    }
    if (activity.content.instructions) {
      lines.push(activity.content.instructions);
      lines.push('');
    }
  } else if (activity.courseSpecType === 'widget') {
    const label = activity.content.description || 'Interactive Activity';
    const widgetName = activity.widgetId?.replace('open-edu.', '') || 'widget';
    lines.push(`### Activity: ${label} [Widget]`);
    lines.push('');
    if (activity.content.instructions) {
      lines.push(activity.content.instructions);
      lines.push('');
    }
    lines.push(
      `> 🧩 **Interactive ${widgetName} activity** — full configuration available in \`course-spec.json\``,
    );
    lines.push('');
  } else if (activity.courseSpecType === 'reading') {
    const label = activity.content.description || stepLabels[activity.step] || 'Reading';
    lines.push(`### Activity: ${label}`);
    lines.push('');
    if (activity.content.instructions) {
      lines.push(activity.content.instructions);
      lines.push('');
    }
  } else if (activity.courseSpecType === 'exercise') {
    const label = activity.content.description || 'Practice';
    lines.push(`### Activity: ${label}`);
    lines.push('');
    if (activity.content.instructions) {
      lines.push(activity.content.instructions);
      lines.push('');
    }
    if (activity.content.examples && activity.content.examples.length > 0) {
      for (const example of activity.content.examples) {
        lines.push(`- ${example}`);
      }
      lines.push('');
    }
  }

  return lines;
}

export function renderCourseSpec(pairs: ConceptActivityPair[]): string {
  const parts: string[] = [];

  parts.push(generateFrontmatter(pairs));

  const chapters = groupByChapter(pairs);

  for (let i = 0; i < chapters.length; i++) {
    const moduleContent = renderModule(chapters[i]!, i);
    parts.push(moduleContent);
  }

  return parts.join('\n\n');
}

export function writeCourseSpec(
  outputDir: string,
  filename: string,
  content: string,
  force: boolean,
): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filePath = join(outputDir, filename);

  if (existsSync(filePath) && !force) {
    throw new Error(`File already exists: ${filePath}. Use --force to overwrite.`);
  }

  const ext = filename.endsWith('.json') ? '.json' : '.md';
  const tmpPath = join(tmpdir(), `course-spec-${Date.now()}${ext}`);
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, filePath);

  return filePath;
}

export function writeCourseSpecOutput(
  outputDir: string,
  filenamePrefix: string,
  pairs: ConceptActivityPair[],
  force: boolean,
): { filePath: string; concepts: number } {
  const content = renderCourseSpec(pairs);
  const filename = `${filenamePrefix}course-spec.md`;
  const filePath = writeCourseSpec(outputDir, filename, content, force);

  return { filePath, concepts: pairs.length };
}

// ---- JSON output types ----

export interface CourseSpecJSON {
  format: 'openedu-course-spec';
  version: 1;
  generatedAt: string;
  metadata: {
    title: string;
    description: string;
    author?: string;
    version?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    estimatedHours?: number;
    generated: boolean;
  };
  lessons: CourseSpecLessonJSON[];
}

export interface CourseSpecLessonJSON {
  id: string;
  title: string;
  objectives: string[];
  coreIdea: string;
  examples: string[];
  misconceptions: string[];
  estimatedMinutes?: number;
  activities: CourseSpecActivityJSON[];
}

export interface CourseSpecActivityJSON {
  step:
    | 'observe'
    | 'guided_practice'
    | 'independent_practice'
    | 'mastery_check'
    | 'positive_completion';
  order: number;
  type: 'reading' | 'exercise' | 'quiz' | 'reflection' | 'widget';
  description: string;
  instructions?: string;
  examples?: string[];
  questions?: MCQQuestion[];
  widgetId?: string;
  widgetConfig?: Record<string, unknown>;
}

export function renderCourseSpecJSON(pairs: ConceptActivityPair[]): CourseSpecJSON {
  const first = pairs[0]?.concept;
  const estimatedHours =
    pairs.reduce((sum, p) => sum + (p.concept.estimatedDuration || 15), 0) / 60;

  const difficulty = pairs.some((p) => p.concept.difficulty === 'advanced')
    ? 'advanced'
    : pairs.some((p) => p.concept.difficulty === 'intermediate')
      ? 'intermediate'
      : 'beginner';

  const title = first?.chapterName
    ? `${first.chapterName} — Auto-generated Course`
    : 'Auto-generated Course';

  const lessons: CourseSpecLessonJSON[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    const lessonNum = 101 + i;
    const lessonId = `lesson-${lessonNum}`;

    lessons.push({
      id: lessonId,
      title: pair.concept.learningObjective,
      objectives: [pair.concept.learningObjective],
      coreIdea: pair.concept.coreIdea,
      examples: pair.concept.examples,
      misconceptions: pair.concept.misconceptions,
      estimatedMinutes: pair.concept.estimatedDuration,
      activities: pair.activities.map((act) => ({
        step: act.step,
        order: act.order,
        type: act.courseSpecType,
        description: act.content.description,
        instructions: act.content.instructions,
        examples: act.content.examples,
        questions: act.content.questions,
        widgetId: act.widgetId,
        widgetConfig: act.widgetConfig,
      })),
    });
  }

  return {
    format: 'openedu-course-spec',
    version: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      title,
      description: `Auto-generated from ${pairs.length} concepts`,
      author: 'OpenEdu Pipeline',
      version: '1.0.0',
      difficulty: difficulty as 'beginner' | 'intermediate' | 'advanced',
      estimatedHours: Math.max(1, Math.round(estimatedHours)),
      generated: true,
    },
    lessons,
  };
}

export function writeCourseSpecJSONOutput(
  outputDir: string,
  filenamePrefix: string,
  pairs: ConceptActivityPair[],
  force: boolean,
): { filePath: string; concepts: number } {
  const content = renderCourseSpecJSON(pairs);
  const filename = `${filenamePrefix}course-spec.json`;
  const jsonStr = JSON.stringify(content, null, 2);
  const filePath = writeCourseSpec(outputDir, filename, jsonStr, force);
  return { filePath, concepts: pairs.length };
}
