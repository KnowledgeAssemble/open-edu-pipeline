import type { GeneratedActivity } from '../types.js';
import type { SubjectValidator, ValidationContext, ValidationIssue } from './registry.js';
import { registerValidator } from './registry.js';
import type { CurriculumProfile } from '../profile/types.js';

export interface MathQuestion {
  questionId: string;
  operation:
    | 'add'
    | 'subtract'
    | 'multiply'
    | 'divide'
    | 'place_value'
    | 'expanded_form'
    | 'compare'
    | 'order'
    | 'fraction_equiv'
    | 'fraction_compare'
    | 'decimal'
    | 'unit_convert'
    | 'area'
    | 'perimeter'
    | 'volume'
    | 'clock'
    | 'money'
    | 'chart';
  inputs: Record<string, number | number[] | string>;
  expectedAnswer: number | string | number[];
  unit?: string;
  tolerance?: number;
}

export interface MathValidationResult {
  questionId: string;
  valid: boolean;
  errors: string[];
  computedAnswer?: number | string;
}

export function validateMathQuestion(question: MathQuestion): MathValidationResult {
  const errors: string[] = [];

  switch (question.operation) {
    case 'add': {
      const numbers = question.inputs.numbers as number[];
      if (!numbers || numbers.length < 2) {
        errors.push('Addition requires at least 2 numbers');
        break;
      }
      const sum = numbers.reduce((a, b) => a + b, 0);
      const expected = Number(question.expectedAnswer);
      if (Math.abs(sum - expected) > (question.tolerance || 0.001)) {
        errors.push(`Addition: computed ${sum}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: sum,
      };
    }

    case 'subtract': {
      const a = question.inputs.a as number;
      const b = question.inputs.b as number;
      if (a === undefined || b === undefined) {
        errors.push('Subtraction requires a and b');
        break;
      }
      const diff = a - b;
      const expected = Number(question.expectedAnswer);
      if (Math.abs(diff - expected) > (question.tolerance || 0.001)) {
        errors.push(`Subtraction: computed ${diff}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: diff,
      };
    }

    case 'multiply': {
      const numbers = question.inputs.numbers as number[];
      if (!numbers || numbers.length < 2) {
        errors.push('Multiplication requires at least 2 numbers');
        break;
      }
      const product = numbers.reduce((a, b) => a * b, 1);
      const expected = Number(question.expectedAnswer);
      if (Math.abs(product - expected) > (question.tolerance || 0.001)) {
        errors.push(`Multiplication: computed ${product}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: product,
      };
    }

    case 'divide': {
      const a = question.inputs.a as number;
      const b = question.inputs.b as number;
      if (b === 0) {
        errors.push('Division by zero');
        break;
      }
      const quot = a / b;
      const expected = Number(question.expectedAnswer);
      if (Math.abs(quot - expected) > (question.tolerance || 0.001)) {
        errors.push(`Division: computed ${quot}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: quot,
      };
    }

    case 'place_value': {
      const number = question.inputs.number as number;
      const place = question.inputs.place as string;
      const numStr = String(number);
      const placeValues: Record<string, number> = {
        ones: numStr.length - 1,
        tens: numStr.length - 2,
        hundreds: numStr.length - 3,
        thousands: numStr.length - 4,
        lakhs: numStr.length - 6,
        crores: numStr.length - 8,
      };
      const idx: number | undefined = placeValues[place];
      if (idx === undefined) {
        errors.push(`Unknown place: ${place}`);
        break;
      }
      const digit = idx >= 0 ? parseInt(numStr[idx] || '0', 10) : 0;
      const expected = Number(question.expectedAnswer);
      if (digit !== expected) {
        errors.push(
          `Place value of ${place} in ${number}: computed ${digit}, expected ${expected}`,
        );
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: digit,
      };
    }

    case 'expanded_form': {
      const number = question.inputs.number as number;
      const form = question.inputs.form as string;
      const num = Number(number);
      const digitStr = String(num);
      const expanded: string[] = [];
      for (let i = 0; i < digitStr.length; i++) {
        const d = parseInt(digitStr[i] || '0', 10);
        if (d !== 0) {
          expanded.push(`${d}${'0'.repeat(digitStr.length - 1 - i)}`);
        }
      }
      const computedForm = expanded.join(' + ');
      if (computedForm !== form) {
        errors.push(`Expanded form of ${num}: computed "${computedForm}", expected "${form}"`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: computedForm,
      };
    }

    case 'compare': {
      const a = question.inputs.a as number;
      const b = question.inputs.b as number;
      const expected = question.expectedAnswer as string;
      const actual = a > b ? '>' : a < b ? '<' : '=';
      if (actual !== expected) {
        errors.push(`Compare ${a} and ${b}: computed "${actual}", expected "${expected}"`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: actual,
      };
    }

    case 'order': {
      const numbers = question.inputs.numbers as number[];
      const order = question.inputs.order as string;
      const sorted =
        order === 'ascending'
          ? [...numbers].sort((a, b) => a - b)
          : [...numbers].sort((a, b) => b - a);
      const expected = question.expectedAnswer as number[];
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        errors.push(
          `Order (${order}): computed ${JSON.stringify(sorted)}, expected ${JSON.stringify(expected)}`,
        );
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: sorted.join(','),
      };
    }

    case 'fraction_equiv': {
      const n1 = question.inputs.n1 as number;
      const d1 = question.inputs.d1 as number;
      const n2 = question.inputs.n2 as number;
      const d2 = question.inputs.d2 as number;
      const equiv = Math.abs(n1 / d1 - n2 / d2) < 0.0001;
      const expected = String(question.expectedAnswer) === 'true';
      if (equiv !== expected) {
        errors.push(
          `Fraction equivalence ${n1}/${d1} vs ${n2}/${d2}: computed ${equiv}, expected ${question.expectedAnswer}`,
        );
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: String(equiv),
      };
    }

    case 'fraction_compare': {
      const n1 = question.inputs.n1 as number;
      const d1 = question.inputs.d1 as number;
      const n2 = question.inputs.n2 as number;
      const d2 = question.inputs.d2 as number;
      const v1 = n1 / d1;
      const v2 = n2 / d2;
      const actual = v1 > v2 ? '>' : v1 < v2 ? '<' : '=';
      const expected = question.expectedAnswer as string;
      if (actual !== expected) {
        errors.push(
          `Fraction compare ${n1}/${d1} vs ${n2}/${d2}: computed "${actual}", expected "${expected}"`,
        );
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: actual,
      };
    }

    case 'decimal': {
      const a = question.inputs.a as number;
      const b = question.inputs.b as number;
      const op = question.inputs.op as string;
      let result: number;
      switch (op) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        default:
          errors.push(`Unknown decimal op: ${op}`);
          return { questionId: question.questionId, valid: false, errors };
      }
      const expected = Number(question.expectedAnswer);
      if (Math.abs(result - expected) > (question.tolerance || 0.01)) {
        errors.push(`Decimal ${op}: computed ${result}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: result,
      };
    }

    case 'unit_convert': {
      const value = question.inputs.value as number;
      const from = question.inputs.from as string;
      const to = question.inputs.to as string;
      const conversions: Record<string, Record<string, number>> = {
        km: { m: 1000, cm: 100000 },
        m: { cm: 100, mm: 1000, km: 0.001 },
        cm: { mm: 10, m: 0.01 },
        kg: { g: 1000 },
        g: { kg: 0.001, mg: 1000 },
        l: { ml: 1000 },
        ml: { l: 0.001 },
        hour: { min: 60, sec: 3600 },
        min: { sec: 60, hour: 1 / 60 },
        rupee: { paisa: 100 },
        paisa: { rupee: 0.01 },
      };
      const factor = conversions[from]?.[to];
      if (factor === undefined) {
        errors.push(`Unknown conversion: ${from} → ${to}`);
        break;
      }
      const converted = value * factor;
      const expected = Number(question.expectedAnswer);
      if (Math.abs(converted - expected) > (question.tolerance || 0.01)) {
        errors.push(
          `Unit conversion ${value} ${from} → ${to}: computed ${converted}, expected ${expected}`,
        );
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: converted,
      };
    }

    case 'area': {
      const length = question.inputs.length as number;
      const width = question.inputs.width as number;
      const area = length * width;
      const expected = Number(question.expectedAnswer);
      if (Math.abs(area - expected) > (question.tolerance || 0.001)) {
        errors.push(`Area: computed ${area}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: area,
      };
    }

    case 'perimeter': {
      const length = question.inputs.length as number;
      const width = question.inputs.width as number;
      const perimeter = 2 * (length + width);
      const expected = Number(question.expectedAnswer);
      if (Math.abs(perimeter - expected) > (question.tolerance || 0.001)) {
        errors.push(`Perimeter: computed ${perimeter}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: perimeter,
      };
    }

    case 'volume': {
      const length = question.inputs.length as number;
      const width = question.inputs.width as number;
      const height = question.inputs.height as number;
      const volume = length * width * height;
      const expected = Number(question.expectedAnswer);
      if (Math.abs(volume - expected) > (question.tolerance || 0.001)) {
        errors.push(`Volume: computed ${volume}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: volume,
      };
    }

    case 'clock': {
      const hour = question.inputs.hour as number;
      const minute = question.inputs.minute as number;
      const expected = question.expectedAnswer as string;
      const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (formatted !== expected) {
        errors.push(`Clock: computed ${formatted}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: formatted,
      };
    }

    case 'money': {
      const amounts = question.inputs.amounts as number[];
      const sum = amounts.reduce((a, b) => a + b, 0);
      const expected = Number(question.expectedAnswer);
      if (Math.abs(sum - expected) > (question.tolerance || 0.01)) {
        errors.push(`Money: computed ${sum}, expected ${expected}`);
      }
      return {
        questionId: question.questionId,
        valid: errors.length === 0,
        errors,
        computedAnswer: sum,
      };
    }

    default:
      errors.push(`Unknown operation: ${question.operation}`);
  }

  return { questionId: question.questionId, valid: errors.length === 0, errors };
}

export function validateMCQOptions(question: {
  question: string;
  options: string[];
  correctIndex: number;
}): string[] {
  const errors: string[] = [];

  if (question.options.length < 2) {
    errors.push('MCQ must have at least 2 options');
  }

  if (question.correctIndex < 0 || question.correctIndex >= question.options.length) {
    errors.push(
      `Correct index ${question.correctIndex} is out of range (0-${question.options.length - 1})`,
    );
  }

  const uniqueOptions = new Set(question.options);
  if (uniqueOptions.size !== question.options.length) {
    errors.push('MCQ has duplicate options');
  }

  return errors;
}

export function validateAllMath(questions: MathQuestion[]): MathValidationResult[] {
  return questions.map(validateMathQuestion);
}

export function extractMathQuestions(activities: GeneratedActivity[]): MathQuestion[] {
  const questions: MathQuestion[] = [];

  for (const activity of activities) {
    const wc = activity.widgetConfig as Record<string, unknown> | undefined;
    if (wc?.math) {
      const mathData = wc.math as Record<string, unknown>;
      if (mathData.operation && mathData.inputs && mathData.expectedAnswer !== undefined) {
        questions.push({
          questionId: `${activity.step}-math-${questions.length}`,
          operation: mathData.operation as MathQuestion['operation'],
          inputs: mathData.inputs as Record<string, number | number[] | string>,
          expectedAnswer: mathData.expectedAnswer as number | string | number[],
          unit: (mathData.unit as string) || '',
          tolerance: (mathData.tolerance as number) || 0.001,
        });
      }
    }
  }

  return questions;
}

export function extractMCQValidationErrors(activities: GeneratedActivity[]): string[] {
  const errors: string[] = [];

  for (const activity of activities) {
    const qs = activity.content.questions;
    if (activity.courseSpecType === 'quiz' && qs) {
      for (let i = 0; i < qs.length; i++) {
        const mcq = qs[i];
        if (!mcq) continue;
        const { question, options, correctIndex } = mcq;
        if (question && options && correctIndex !== undefined) {
          const mcqErrors = validateMCQOptions({ question, options, correctIndex });
          if (mcqErrors.length > 0) {
            errors.push(...mcqErrors.map((e) => `[${activity.step}-q${i}] ${e}`));
          }
        }
      }
    }
  }

  return errors;
}

export const MathValidator: SubjectValidator = {
  id: 'math',
  supports: (profile: CurriculumProfile) => profile.validatorIds.includes('math'),
  validateConcepts: (ctx: ValidationContext): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (const concept of ctx.concepts) {
      if (!concept.exerciseFamilies || concept.exerciseFamilies.length === 0) {
        issues.push({
          id: `no-exercise-${concept.conceptId}`,
          severity: 'warning',
          message: `Math concept "${concept.conceptId}" has no exercise families`,
          source: 'math',
        });
      }
    }
    return issues;
  },
  validateActivities: (ctx: ValidationContext): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (const activity of ctx.activities) {
      if (activity.courseSpecType === 'quiz' && activity.content.questions) {
        for (const q of activity.content.questions) {
          if (q && q.options) {
            const mcqErrors = validateMCQOptions({
              question: q.question,
              options: q.options,
              correctIndex: q.correctIndex,
            });
            for (const e of mcqErrors) {
              issues.push({
                id: `mcq-${activity.step}`,
                severity: 'error',
                message: `MCQ validation: ${e}`,
                source: 'math',
              });
            }
          }
        }
      }
    }
    return issues;
  },
};

registerValidator(MathValidator);
