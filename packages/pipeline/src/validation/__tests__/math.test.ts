import { describe, it, expect } from 'vitest';
import { validateMathQuestion, validateMCQOptions, validateAllMath } from '../math.js';
import type { MathQuestion } from '../math.js';

function q(overrides: Partial<MathQuestion>): MathQuestion {
  return { questionId: 'q1', operation: 'add', inputs: {}, expectedAnswer: 0, ...overrides };
}

describe('validateMathQuestion', () => {
  it('validates addition', () => {
    expect(
      validateMathQuestion(q({ operation: 'add', inputs: { numbers: [2, 3] }, expectedAnswer: 5 }))
        .valid,
    ).toBe(true);
    expect(
      validateMathQuestion(q({ operation: 'add', inputs: { numbers: [2, 3] }, expectedAnswer: 6 }))
        .valid,
    ).toBe(false);
    expect(
      validateMathQuestion(q({ operation: 'add', inputs: { numbers: [0, 0] }, expectedAnswer: 0 }))
        .valid,
    ).toBe(true);
  });

  it('validates subtraction', () => {
    expect(
      validateMathQuestion(q({ operation: 'subtract', inputs: { a: 10, b: 3 }, expectedAnswer: 7 }))
        .valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({ operation: 'subtract', inputs: { a: 3, b: 10 }, expectedAnswer: -7 }),
      ).valid,
    ).toBe(true);
  });

  it('validates multiplication', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'multiply', inputs: { numbers: [4, 5] }, expectedAnswer: 20 }),
      ).valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({ operation: 'multiply', inputs: { numbers: [5, 0] }, expectedAnswer: 0 }),
      ).valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({ operation: 'multiply', inputs: { numbers: [5, 1] }, expectedAnswer: 5 }),
      ).valid,
    ).toBe(true);
  });

  it('validates division', () => {
    expect(
      validateMathQuestion(q({ operation: 'divide', inputs: { a: 20, b: 4 }, expectedAnswer: 5 }))
        .valid,
    ).toBe(true);
    expect(validateMathQuestion(q({ operation: 'divide', inputs: { a: 20, b: 0 } })).valid).toBe(
      false,
    );
  });

  it('validates place_value', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'place_value',
          inputs: { number: 352, place: 'hundreds' },
          expectedAnswer: 3,
        }),
      ).valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({
          operation: 'place_value',
          inputs: { number: 352648, place: 'lakhs' },
          expectedAnswer: 5,
        }),
      ).valid,
    ).toBe(false);
  });

  it('validates expanded_form', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'expanded_form',
          inputs: { number: 352, form: '300 + 50 + 2' },
          expectedAnswer: 352,
        }),
      ).valid,
    ).toBe(true);
  });

  it('validates compare', () => {
    expect(
      validateMathQuestion(q({ operation: 'compare', inputs: { a: 5, b: 3 }, expectedAnswer: '>' }))
        .valid,
    ).toBe(true);
    expect(
      validateMathQuestion(q({ operation: 'compare', inputs: { a: 5, b: 3 }, expectedAnswer: '<' }))
        .valid,
    ).toBe(false);
    expect(
      validateMathQuestion(
        q({ operation: 'compare', inputs: { a: 10, b: 10 }, expectedAnswer: '=' }),
      ).valid,
    ).toBe(true);
  });

  it('validates order', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'order',
          inputs: { numbers: [3, 1, 2], order: 'ascending' },
          expectedAnswer: [1, 2, 3],
        }),
      ).valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({
          operation: 'order',
          inputs: { numbers: [3, 1, 2], order: 'descending' },
          expectedAnswer: [3, 2, 1],
        }),
      ).valid,
    ).toBe(true);
  });

  it('validates fraction_equiv', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'fraction_equiv',
          inputs: { n1: 1, d1: 2, n2: 2, d2: 4 },
          expectedAnswer: 'true',
        }),
      ).valid,
    ).toBe(true);
    expect(
      validateMathQuestion(
        q({
          operation: 'fraction_equiv',
          inputs: { n1: 1, d1: 2, n2: 1, d2: 3 },
          expectedAnswer: 'false',
        }),
      ).valid,
    ).toBe(true);
  });

  it('validates fraction_compare', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'fraction_compare',
          inputs: { n1: 1, d1: 2, n2: 1, d2: 3 },
          expectedAnswer: '>',
        }),
      ).valid,
    ).toBe(true);
  });

  it('validates decimal', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'decimal',
          inputs: { a: 1.5, b: 2.3, op: 'add' },
          expectedAnswer: 3.8,
          tolerance: 0.01,
        }),
      ).valid,
    ).toBe(true);
  });

  it('validates unit_convert', () => {
    expect(
      validateMathQuestion(
        q({
          operation: 'unit_convert',
          inputs: { value: 1, from: 'km', to: 'm' },
          expectedAnswer: 1000,
        }),
      ).valid,
    ).toBe(true);
    const unknown = validateMathQuestion(
      q({
        operation: 'unit_convert',
        inputs: { value: 1, from: 'unknown', to: 'm' },
        expectedAnswer: 0,
      }),
    );
    expect(unknown.valid).toBe(false);
  });

  it('validates area', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'area', inputs: { length: 5, width: 3 }, expectedAnswer: 15 }),
      ).valid,
    ).toBe(true);
  });

  it('validates perimeter', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'perimeter', inputs: { length: 5, width: 3 }, expectedAnswer: 16 }),
      ).valid,
    ).toBe(true);
  });

  it('validates volume', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'volume', inputs: { length: 3, width: 4, height: 5 }, expectedAnswer: 60 }),
      ).valid,
    ).toBe(true);
  });

  it('validates clock', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'clock', inputs: { hour: 2, minute: 30 }, expectedAnswer: '02:30' }),
      ).valid,
    ).toBe(true);
  });

  it('validates money', () => {
    expect(
      validateMathQuestion(
        q({ operation: 'money', inputs: { amounts: [10, 20, 50] }, expectedAnswer: 80 }),
      ).valid,
    ).toBe(true);
  });
});

describe('validateMCQOptions', () => {
  it('accepts valid MCQ', () => {
    expect(
      validateMCQOptions({ question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }),
    ).toEqual([]);
  });

  it('rejects duplicate options', () => {
    const errs = validateMCQOptions({
      question: 'Q',
      options: ['A', 'A', 'C', 'D'],
      correctIndex: 0,
    });
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('rejects out-of-range correctIndex', () => {
    const errs = validateMCQOptions({
      question: 'Q',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 10,
    });
    expect(errs.some((e) => e.includes('out of range'))).toBe(true);
  });

  it('rejects too few options', () => {
    const errs = validateMCQOptions({ question: 'Q', options: ['A'], correctIndex: 0 });
    expect(errs.some((e) => e.includes('at least 2'))).toBe(true);
  });
});

describe('validateAllMath', () => {
  it('validates multiple questions', () => {
    const results = validateAllMath([
      q({ operation: 'add', inputs: { numbers: [2, 3] }, expectedAnswer: 5 }),
      q({ operation: 'add', inputs: { numbers: [2, 3] }, expectedAnswer: 6 }),
    ]);
    expect(results.filter((r) => r.valid).length).toBe(1);
    expect(results.filter((r) => !r.valid).length).toBe(1);
  });
});
