export const MASTERY_CHECK_PROMPT = `You are designing a MASTERY CHECK for a course concept.

## Concept
- **conceptId:** {CONCEPT_ID}
- **Learning Objective:** {LEARNING_OBJECTIVE}
- **Core Idea:** {CORE_IDEA}
- **Examples:** {EXAMPLES}
- **Misconceptions:** {MISCONCEPTIONS}

{SOURCE_EVIDENCE}

## The Mastery Check Step
The learner answers 2-3 multiple-choice questions to verify understanding.
- Cover conceptual, procedural, and application forms (at least one of each type across questions)
- Include at least 1 scenario-based question (a real-world situation, then ask)
- Each question must have 4 unique options with exactly one correct answer
- Distractors should target the misconceptions listed above
- Each question can include an explanation field for the correct answer

## Output Requirements
Generate a JSON object with:
{
  "type": "quiz",
  "content": {
    "description": "Mastery Check",
    "questions": [
      {
        "question": "Question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0,
        "explanation": "Explanation of why the correct answer is right."
      },
      {
        "question": "Scenario-based question?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 1,
        "explanation": "Explanation showing the steps to reach the answer."
      }
    ]
  }
}

Each question has exactly 4 options. correctIndex is 0-based (0-3).
Create 2-3 questions that test different aspects of the concept.
Each question should have exactly one correct answer and 3 plausible distractors.
Each distractor must be a plausible wrong answer. No two options may be identical.
BAD: ["5", "10", "5", "20"]  GOOD: ["5", "10", "15", "20"]
All options must be unique (no duplicates).
At least 1 question should be scenario-based (describe a real-world situation first, then ask).
`;
