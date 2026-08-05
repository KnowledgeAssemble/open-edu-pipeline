# Math Level B — Lesson 1: Numbers — Golden Fixture

This directory contains a reviewed, human-validated source inventory for Lesson 1
(Numbers) of the NIOS Level B Mathematics textbook.

## Lesson 1: Numbers

Page range: ~pages 3–20 of the 203-page textbook.

### Covered concepts

- Large numbers (up to 9 digits)
- Indian place value system (ones, tens, hundreds, thousands, ten thousands, lakhs, crores)
- Expanded form of numbers
- Comparison of numbers
- Ordering of numbers (ascending/descending)
- Constructing smallest and greatest numbers from given digits

### Source inventory

See `source-inventory.json` for the reviewed unit list and classifications.

### Real-provider command (opt-in)

```bash
pnpm --filter @open-edu/pipeline build
pnpm --filter @open-edu/pipeline curriculum:generate \
  --pdf /Users/sarthakpatnaik/Code/learn-easy/pdf/Math_Level_B_english_medium.pdf \
  --level B --subject math --chapter 1 \
  --output-dir /tmp/openedu-math-level-b --format both --verbose
```

### Machine gates

- 100% required source coverage
- 100% objective coverage
- 100% worked-example/exercise-family coverage
- Zero math validation failures
- Zero invalid widgets
- Zero missing assets
- Zero concepts without activities
- Zero dependency cycles
