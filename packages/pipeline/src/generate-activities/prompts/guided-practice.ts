export const GUIDED_PRACTICE_PROMPT = `You are designing a GUIDED PRACTICE activity for a course concept.

## Concept
- **conceptId:** {CONCEPT_ID}
- **Learning Objective:** {LEARNING_OBJECTIVE}
- **Core Idea:** {CORE_IDEA}
- **Examples:** {EXAMPLES}
- **Misconceptions:** {MISCONCEPTIONS}

{SOURCE_EVIDENCE}

{ASSET_REFERENCES}

## The Guided Practice Step
The learner tries with hints and support. Scaffold for the identified misconceptions.
- Include hints that address common errors listed in the misconceptions above
- Provide 2-3 problems with increasing difficulty
- Each hint should guide without giving the answer — prompt the learner to check their work
- For worked examples, show partial solutions with the learner completing the final steps

## Available Widgets
You may output \`type: "exercise"\` for text problems or \`type: "widget"\` with \`interactive: true\` for visual interactive practice. Choose \`widget\` when the concept lends itself to matching, sorting, sequencing, filling blanks, or drag-drop activities with hints.

### Widget List
| Widget ID | Best For | Key Config |
|-----------|----------|------------|
| \`core.matching\` | Matching terms to definitions, concept pairs | \`pairs[{itemA, itemB}]\` |
| \`core.drag-drop\` | Sorting items into categories | \`items[{id,label}]\`, \`targets[{id,label}]\`, \`expectedPositions\` |
| \`core.story-question\` | Narrative/scenario-based comprehension | \`scenario\`, \`questions[{question,options,correctIndex}]\` |
| \`math.fraction-visual\` | Parts of a whole, fractions | \`numerator\`, \`denominator\`, \`mode: "bar"|"circle"\` |
| \`core.chart-reader\` | Bar charts and pictographs | \`type: "bar"|"pictograph"\`, \`data[{label,value}]\` |
| \`math.clock-time\` | Reading/setting clocks | \`hour\`, \`minute\`, \`mode: "read"|"set"\` |
| \`math.measurement-scale\` | Measuring with ruler/thermometer/cylinder | \`type\`, \`min\`, \`max\`, \`step\`, \`unit\` |
| \`math.place-value-chart\` | Place value (Indian system) | \`maxPlaces\`, \`targetNumber\` |
| \`math.grid-area\` | Area/perimeter counting | \`rows\`, \`cols\`, \`mode: "area"|"perimeter"\` |
| \`core.visual-counting\` | Counting objects, simple addition | \`count\`, \`emoji\` or \`items[]\` |
| \`core.fill-blank\` | Fill-in-the-blank exercises | \`template\` (with \`___\` blanks), \`blanks[]\` |
| \`core.sequencing\` | Ordering steps or events | \`items[{id,label}]\`, \`correctOrder[id]\` |
| \`core.real-world\` | Real-world scenario + self-assessment | \`scenario\`, \`taskDescription\` |
| \`core.multiple-choice\` | Multiple choice quiz | \`questions[{question,options[],correctIndex}]\` |
| \`math.number-line\` | Number line visualization | \`min\`, \`max\`, \`target\`, \`markers[]\` |

## Output Requirements
Generate a JSON object with one of these formats:

### Text format (type: "exercise")
{
  "type": "exercise",
  "content": {
    "description": "Short title for this practice activity",
    "instructions": "Practice problems with step-by-step guidance and hints. Include 2-3 problems. Use **tables** and \`![Diagram](concept-id)\` for visual references.",
    "examples": ["Problem 1 with solution hint", "Problem 2 with solution hint"]
  }
}

### Widget format (type: "widget")
{
  "type": "widget",
  "content": {
    "description": "Short title for this activity",
    "instructions": "Brief description of what the learner should do"
  },
  "widgetId": "core.drag-drop",
  "widgetConfig": {
    "items": [{"id": "i1", "label": "Item 1", "emoji": "\\uD83D\\uDD24"}],
    "targets": [{"id": "t1", "label": "Target 1"}],
    "expectedPositions": {"i1": "t1"},
    "interactive": true,
    "hints": ["Hint 1 — check the leftmost digit", "Hint 2 — compare place values"]
  }
}

When using widget format, set \`interactive: true\` and include \`hints\` for guided practice. Hints should target the misconceptions listed above.

The instructions should contain practice problems with hints or scaffolding to help the learner (for text format).
`;
