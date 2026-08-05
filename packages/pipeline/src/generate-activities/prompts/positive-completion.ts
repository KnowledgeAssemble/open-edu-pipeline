export const POSITIVE_COMPLETION_PROMPT = `You are designing a POSITIVE COMPLETION activity for a course concept.

## Concept
- **conceptId:** {CONCEPT_ID}
- **Learning Objective:** {LEARNING_OBJECTIVE}
- **Core Idea:** {CORE_IDEA}

## The Positive Completion Step
Celebrate the learner's achievement! This is an encouraging message with a reflection prompt.

## Output Requirements
Generate a JSON object with:
{
  "type": "reflection",
  "content": {
    "description": "Encouraging title (e.g., 'Great work!', 'Excellent!', 'Well done!')",
    "instructions": "A positive message congratulating the learner and a question prompting them to reflect on what they learned."
  }
}

The instructions should include:
- A congratulatory message acknowledging the specific concept mastered
- A reflection question about the concept that connects to daily life
- A suggestion for a real-world activity the learner can do (e.g., 'Draw a place value chart for your family telephone numbers', 'Create a bar chart of your weekly schedule', 'Measure 5 objects at home and record their lengths')
`;
