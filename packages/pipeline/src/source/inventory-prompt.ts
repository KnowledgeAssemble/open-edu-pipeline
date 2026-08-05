export function buildInventoryPrompt(
  units: Array<{ id: string; pageStart: number; heading?: string; text: string }>,
  subject?: string,
): string {
  const unitsJson = JSON.stringify(units, null, 2);
  const subjectText = subject || 'textbook';
  return `You are classifying source units extracted from a ${subjectText}.

Each unit has an ID, page number, optional heading, and text.

Classify each unit into exactly one of these types:
- lesson: Start of a new lesson/chapter
- section: Major section within a lesson
- objective: Learning objectives or goals
- definition: Formal definition of a term or concept
- worked_example: Step-by-step worked example with solution
- exercise: Practice exercises or problems (grouped)
- review: Review or revision section
- assessment: Test, quiz, or assessment section
- diagram: Figure, chart, diagram, or illustration description
- unclassified: Does not clearly fit any category

Input units:
${unitsJson}

Return a JSON object with a "classifications" array. Each entry has:
- "unitId": the original unit ID
- "type": one of the types above
- "extractionConfidence": 0.0-1.0

Do not invent new unit IDs. Only classify the units provided.`;
}
