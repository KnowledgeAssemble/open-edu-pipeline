export interface Exemplar {
  type: string;
  step: string;
  conceptDescription: string;
  content: {
    description: string;
    instructions?: string;
    examples?: string[];
    questions?: { question: string; options: string[]; correctIndex: number }[];
    widgetConfig?: Record<string, unknown>;
  };
  widgetId?: string;
}

export const EXEMPLARS: Exemplar[] = [
  {
    type: 'reading',
    step: 'observe',
    conceptDescription: 'addition_1_10 — Add numbers up to 10',
    content: {
      description: 'Understanding addition',
      instructions: 'Addition means putting two groups together to find the total.',
      examples: [
        '2 apples + 1 apple = 3 apples',
        '3 oranges + 2 oranges = 5 oranges',
        '4 stars + 3 stars = 7 stars',
      ],
    },
  },
  {
    type: 'reading',
    step: 'observe',
    conceptDescription: 'basic_shapes — Identify common shapes',
    content: {
      description: 'Learning about shapes',
      instructions:
        'Shapes are all around us. A circle is round like a wheel. A square has four equal sides like a window.',
      examples: ['A ball is a circle', 'A book is a rectangle', 'A slice of pizza is a triangle'],
    },
  },
  {
    type: 'exercise',
    step: 'guided_practice',
    conceptDescription: 'counting_1_10 — Count objects from 1 to 10',
    content: {
      description: 'Count the objects',
      instructions:
        'Count each group of objects. Start from 1 and point to each object as you count.',
      examples: ['How many stars? ★★★ = 3', 'How many apples? 🍎🍎🍎🍎🍎 = 5'],
    },
  },
  {
    type: 'exercise',
    step: 'guided_practice',
    conceptDescription: 'addition_1_10 — Add two numbers',
    content: {
      description: 'Practice adding numbers',
      instructions: 'Add the numbers together. Use objects to help you count.',
      examples: [
        '2 + 1 = ? Hint: Count 2, then count 1 more',
        '3 + 2 = ? Hint: Count 3, then count 2 more',
      ],
    },
  },
  {
    type: 'exercise',
    step: 'independent_practice',
    conceptDescription: 'addition_1_10 — Add without help',
    content: {
      description: 'Add on your own',
      instructions: 'Solve these addition problems without help.',
      examples: ['4 + 3 = ?', '5 + 2 = ?', '6 + 1 = ?'],
    },
  },
  {
    type: 'quiz',
    step: 'mastery_check',
    conceptDescription: 'addition_1_10 — Check understanding',
    content: {
      description: 'Mastery Check',
      questions: [
        { question: 'What is 2 + 1?', options: ['2', '3', '4', '5'], correctIndex: 1 },
        { question: 'What is 3 + 2?', options: ['4', '5', '6', '7'], correctIndex: 1 },
      ],
    },
  },
  {
    type: 'reflection',
    step: 'positive_completion',
    conceptDescription: 'any concept — encouragement',
    content: {
      description: 'Great work!',
      instructions:
        'You have learned how to add numbers. Think about where you see addition in your daily life.',
    },
  },
  {
    type: 'reading',
    step: 'observe',
    conceptDescription: 'fractions_intro — Understand parts of a whole',
    content: {
      description: 'What is a fraction?',
      instructions:
        'A fraction shows a part of a whole. If a pizza is cut into 4 slices and you take 1, that is one fourth (1/4) of the pizza.',
      examples: [
        '1 slice of pizza cut into 4 pieces = 1/4',
        '1 half of an apple = 1/2',
        '3 quarters of a chocolate bar = 3/4',
      ],
    },
  },
  {
    type: 'exercise',
    step: 'guided_practice',
    conceptDescription: 'fractions_intro — Identify parts of a whole',
    content: {
      description: 'Identify the fraction',
      instructions: 'Look at each picture. What fraction is shaded?',
      examples: [
        'A circle with 1 of 4 parts shaded = 1/4',
        'A rectangle with 2 of 3 parts shaded = 2/3',
      ],
    },
  },
  {
    type: 'quiz',
    step: 'mastery_check',
    conceptDescription: 'fractions_intro — Check understanding of fractions',
    content: {
      description: 'Fractions Quiz',
      questions: [
        {
          question: 'If a pizza has 8 slices and you eat 3, what fraction did you eat?',
          options: ['3/8', '5/8', '8/3', '1/8'],
          correctIndex: 0,
        },
        {
          question: 'Which is larger: 1/2 or 1/4?',
          options: ['1/2', '1/4', 'They are equal', 'Cannot tell'],
          correctIndex: 0,
        },
      ],
    },
  },
  {
    type: 'reflection',
    step: 'positive_completion',
    conceptDescription: 'fractions_intro — Encouragement for fractions',
    content: {
      description: 'Excellent work with fractions!',
      instructions:
        'You now understand how fractions work. Try cutting a fruit into equal parts and naming the fractions.',
    },
  },
  {
    type: 'reading',
    step: 'observe',
    conceptDescription: 'place_value_1_100 — Understand tens and ones',
    content: {
      description: 'Understanding tens and ones',
      instructions:
        'In a two-digit number, the first digit tells how many tens, and the second digit tells how many ones.',
      examples: [
        '23 has 2 tens and 3 ones',
        '47 has 4 tens and 7 ones',
        '90 has 9 tens and 0 ones',
      ],
    },
  },
  {
    type: 'exercise',
    step: 'guided_practice',
    conceptDescription: 'place_value_1_100 — Identify tens and ones',
    content: {
      description: 'Find the tens and ones',
      instructions: 'For each number, tell how many tens and how many ones.',
      examples: ['35 has ___ tens and ___ ones', '61 has ___ tens and ___ ones'],
    },
  },
  {
    type: 'exercise',
    step: 'independent_practice',
    conceptDescription: 'place_value_1_100 — Practice place value',
    content: {
      description: 'Place value practice',
      instructions: 'Write the number that has the given tens and ones.',
      examples: ['4 tens and 2 ones = ?', '7 tens and 9 ones = ?', '3 tens and 0 ones = ?'],
    },
  },
  {
    type: 'quiz',
    step: 'mastery_check',
    conceptDescription: 'place_value_1_100 — Place value quiz',
    content: {
      description: 'Place Value Quiz',
      questions: [
        { question: 'How many tens are in 56?', options: ['5', '6', '56', '0'], correctIndex: 0 },
        {
          question: 'What number has 8 tens and 4 ones?',
          options: ['48', '84', '8', '4'],
          correctIndex: 1,
        },
      ],
    },
  },
  {
    type: 'widget',
    step: 'observe',
    conceptDescription: 'family_types — Identify different family structures',
    content: {
      description: 'Family Types Matching',
      instructions: 'Match each family type to its description.',
      widgetConfig: {
        pairs: [
          { itemA: 'Joint Family', itemB: 'Multiple generations living together' },
          { itemA: 'Nuclear Family', itemB: 'Parents and children only' },
          { itemA: 'Single-Parent Family', itemB: 'One parent raising children' },
        ],
      },
    },
    widgetId: 'core.matching',
  },
  {
    type: 'widget',
    step: 'guided_practice',
    conceptDescription: "girls_education — Issues affecting girls' status",
    content: {
      description: 'Issues Affecting Girls',
      instructions: 'Drag each issue to the correct category.',
      widgetConfig: {
        items: [
          { id: 'i1', label: 'Female infanticide', emoji: '⚠️' },
          { id: 'i2', label: 'Less education for girls', emoji: '📚' },
          { id: 'i3', label: 'Early marriage', emoji: '💍' },
        ],
        targets: [
          { id: 't1', label: 'Social Issue' },
          { id: 't2', label: 'Educational Issue' },
        ],
        expectedPositions: { i1: 't1', i2: 't2', i3: 't1' },
        interactive: true,
      },
    },
    widgetId: 'core.drag-drop',
  },
  {
    type: 'widget',
    step: 'independent_practice',
    conceptDescription: 'respect_elders — Explain the importance of respecting elders',
    content: {
      description: 'Ways to Respect Elders',
      instructions: 'Put the steps in the correct order for showing respect to elders.',
      widgetConfig: {
        items: [
          { id: 's1', label: 'Listen carefully' },
          { id: 's2', label: 'Acknowledge their advice' },
          { id: 's3', label: 'Apply what you learned' },
          { id: 's4', label: 'Thank them' },
        ],
        correctOrder: ['s1', 's2', 's3', 's4'],
        interactive: true,
      },
    },
    widgetId: 'core.sequencing',
  },
  {
    type: 'widget',
    step: 'observe',
    conceptDescription: 'indian_place_value — Indian place value chart for large numbers',
    content: {
      description: 'Indian Place Value Chart',
      instructions:
        'Observe how digits are grouped in the Indian place value system: ones, tens, hundreds, thousands, ten thousands, lakhs, crores.',
      widgetConfig: {
        maxPlaces: 7,
        targetNumber: 352648,
        interactive: false,
      },
    },
    widgetId: 'math.place-value-chart',
  },
  {
    type: 'widget',
    step: 'observe',
    conceptDescription: 'fractions_intro — Visual fraction representation',
    content: {
      description: 'Fraction Visual',
      instructions: 'Observe the shaded portion representing the fraction.',
      widgetConfig: {
        numerator: 3,
        denominator: 4,
        mode: 'bar',
        interactive: false,
      },
    },
    widgetId: 'math.fraction-visual',
  },
  {
    type: 'widget',
    step: 'observe',
    conceptDescription: 'number_line — Number line from 0 to 10',
    content: {
      description: 'Number Line',
      instructions: 'Observe the position of the target number on the number line.',
      widgetConfig: {
        min: 0,
        max: 10,
        target: 7,
        markers: [3, 5, 7],
        interactive: false,
      },
    },
    widgetId: 'math.number-line',
  },
  {
    type: 'widget',
    step: 'guided_practice',
    conceptDescription: 'decimal_place_value — Decimal grid showing tenths and hundredths',
    content: {
      description: 'Decimal Grid Practice',
      instructions:
        'Shade the correct number of squares to represent the decimal. Hint: 1 full row = 1 tenth.',
      widgetConfig: {
        whole: 0,
        tenths: 2,
        hundredths: 5,
        interactive: true,
        hints: ['Each row has 10 squares', 'Count the shaded squares carefully'],
      },
    },
    widgetId: 'math.measurement-scale',
  },
  {
    type: 'widget',
    step: 'guided_practice',
    conceptDescription: 'measurement — Measuring with a ruler',
    content: {
      description: 'Ruler Measurement',
      instructions: 'Find the measurement marked on the ruler.',
      widgetConfig: {
        type: 'ruler',
        min: 0,
        max: 15,
        step: 1,
        unit: 'cm',
        interactive: true,
      },
    },
    widgetId: 'math.measurement-scale',
  },
  {
    type: 'widget',
    step: 'independent_practice',
    conceptDescription: 'area_counting — Counting grid squares to find area',
    content: {
      description: 'Area Grid Practice',
      instructions: 'Count the shaded squares to find the area. No hints — solve independently.',
      widgetConfig: {
        rows: 5,
        cols: 4,
        mode: 'area',
        shadedCells: [0, 1, 2, 3, 4, 5, 6, 7],
        interactive: true,
      },
    },
    widgetId: 'math.grid-area',
  },
  {
    type: 'widget',
    step: 'independent_practice',
    conceptDescription: 'chart_reading — Bar chart interpretation',
    content: {
      description: 'Bar Chart Practice',
      instructions: 'Study the bar chart and answer the questions independently.',
      widgetConfig: {
        type: 'bar',
        data: [
          { label: 'Apples', value: 12 },
          { label: 'Oranges', value: 8 },
          { label: 'Bananas', value: 15 },
          { label: 'Grapes', value: 10 },
        ],
        interactive: true,
      },
    },
    widgetId: 'core.chart-reader',
  },
  {
    type: 'reading',
    step: 'observe',
    conceptDescription: 'geometry_basic — Identifying basic shapes and their properties',
    content: {
      description: 'Basic Geometry',
      instructions:
        'Observe the properties of common shapes. A square has 4 equal sides. A rectangle has opposite sides equal. A triangle has 3 sides. A circle has no sides.',
      examples: [
        'Square: 4 equal sides, 4 corners',
        'Rectangle: 2 pairs of equal sides, 4 corners',
        'Triangle: 3 sides, 3 corners',
        'Circle: curved line, no corners',
      ],
    },
  },
  {
    type: 'quiz',
    step: 'mastery_check',
    conceptDescription: 'comparison_ordering — Comparing and ordering numbers',
    content: {
      description: 'Comparison and Ordering Quiz',
      questions: [
        {
          question: 'Which number is larger: 3,52,648 or 3,25,468?',
          options: ['3,52,648', '3,25,468', 'They are equal', 'Cannot tell without counting'],
          correctIndex: 0,
        },
        {
          question: 'Arrange in ascending order: 45,632; 45,362; 46,532; 44,900',
          options: [
            '44,900; 45,362; 45,632; 46,532',
            '45,632; 45,362; 46,532; 44,900',
            '46,532; 45,632; 45,362; 44,900',
            '44,900; 45,632; 45,362; 46,532',
          ],
          correctIndex: 0,
        },
      ],
    },
  },
];
