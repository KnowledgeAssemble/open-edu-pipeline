export const INDEPENDENT_PRACTICE_PROMPT = `You are designing an INDEPENDENT PRACTICE activity for a course concept.

## Concept
- **conceptId:** {CONCEPT_ID}
- **Learning Objective:** {LEARNING_OBJECTIVE}
- **Core Idea:** {CORE_IDEA}
- **Examples:** {EXAMPLES}
- **Misconceptions:** {MISCONCEPTIONS}

{SOURCE_EVIDENCE}

{ASSET_REFERENCES}

## The Independent Practice Step
The learner practices on their own with NO hints. This step should be slightly harder than guided practice.
- Include 3-4 problems with NO hints
- Include at least 1 word problem for transfer of learning
- Vary the question format — direct computation, word problems, visual interpretation
- Slightly harder numbers or scenarios than guided practice

## Available Widgets
You may output \`type: "exercise"\` for text problems or \`type: "widget"\` with \`interactive: true\` for visual interactive practice. Choose \`widget\` when the concept lends itself to matching, sorting, sequencing, filling blanks, or drag-drop activities. Do NOT include hints in widget config for independent practice.

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
    "instructions": "Practice problems for the learner to solve independently. Include 3-4 problems without hints. Include at least 1 word problem. Use **tables** and \`![Diagram](concept-id)\` for visual references.",
    "examples": ["Problem 1", "Problem 2", "Problem 3 (word problem)"]
  }
}

### Widget format (type: "widget")
{
  "type": "widget",
  "content": {
    "description": "Short title for this activity",
    "instructions": "Brief description of what the learner should do"
  },
  "widgetId": "core.sequencing",
  "widgetConfig": {
    "items": [{"id": "s1", "label": "First step"}, {"id": "s2", "label": "Second step"}, {"id": "s3", "label": "Third step"}],
    "correctOrder": ["s1", "s2", "s3"],
    "interactive": true
  }
}

When using widget format, set \`interactive: true\` and do NOT include hints.

The instructions should contain practice problems without hints — the learner should solve these on their own.
`;
