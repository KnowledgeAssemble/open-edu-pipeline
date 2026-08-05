export const OBSERVE_PROMPT = `You are designing an OBSERVE activity for a course concept.

## Concept
- **conceptId:** {CONCEPT_ID}
- **Learning Objective:** {LEARNING_OBJECTIVE}
- **Core Idea:** {CORE_IDEA}
- **Examples:** {EXAMPLES}
- **Misconceptions:** {MISCONCEPTIONS}

{SOURCE_EVIDENCE}

{ASSET_REFERENCES}

## The Observe Step
The observe step is the first activity. The instructor demonstrates the concept. Use concrete→visual→symbolic explanation sequence. For worked examples, show each step clearly.
- Begin with a concrete, tangible example
- Move to a visual representation (diagram, chart, or widget)
- Conclude with symbolic notation
- Show, don't just tell — be visual and descriptive

## Available Widgets
You may output \`type: "reading"\`, \`type: "exercise"\`, or \`type: "widget"\` with a \`widgetId\` + \`widgetConfig\`. Choose \`widget\` when the concept has visual or interactive potential. For the observe step, prefer \`type: "widget"\` with \`interactive: false\` for visual concepts.

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
| \`science.process-diagram\` | Flow or process diagrams | \`nodes[]\`, \`connections[]\` |

## Output Requirements
Generate a JSON object with one of these formats:

### Text format (type: "reading")
{
  "type": "reading",
  "content": {
    "description": "Short title for this activity",
    "instructions": "The main explanatory markdown content. Use **tables** for comparisons, ![Diagram description](concept-id) for image references, **bold** for key terms.",
    "examples": ["Example 1 description", "Example 2 description", "Example 3 description"]
  }
}

### Widget format (type: "widget")
{
  "type": "widget",
  "content": {
    "description": "Short title for this activity",
    "instructions": "Brief description shown alongside the widget"
  },
  "widgetId": "math.place-value-chart",
  "widgetConfig": { "maxPlaces": 7, "targetNumber": 352648, "interactive": false }
}

When using widget format, set \`interactive: false\` for observe step unless the concept specifically requires interaction.

The instructions should be 2-4 paragraphs of clear explanatory text suitable for a course-spec.md format (for reading type) or a concise description (for widget type).
`;
