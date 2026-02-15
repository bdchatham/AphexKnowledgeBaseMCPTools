# Documentation Test Fixtures

This directory contains sample `.archon.md` documentation files for testing the documentation generator and related functionality.

## Fixture Types

### Standard Documentation (`sample-with-manual-sections.archon.md`)

A typical generated documentation file with:
- Generated header with ARN and hash metadata
- Purpose and description sections
- Function signature
- Manual sections preserved between `<!-- archon:manual -->` markers

**Use Case:** Testing manual section preservation (Requirement 4.5)

### Orphaned Documentation (`sample-orphaned.archon.md`)

Documentation for a source file that has been deleted:
- Contains `<!-- archon:orphaned -->` marker
- Indicates the source file no longer exists

**Use Case:** Testing orphaned documentation marking (Requirement 4.9)

### Unicode Documentation (`sample-unicode.archon.md`)

Documentation with non-ASCII characters:
- Chinese function names and descriptions
- Unicode symbols in ARNs
- Multi-language content

**Use Case:** Testing unicode handling in documentation generation

### Large File Documentation (`sample-large-file.archon.md`)

Documentation for a file with many symbols:
- 10 functions
- 5 classes
- 3 types
- Multiple ARN references

**Use Case:** Testing documentation generation for complex files

## Usage in Tests

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';

const fixturesDir = join(__dirname, '..', 'fixtures', 'docs');

// Test manual section preservation
const withManual = await readFile(
  join(fixturesDir, 'sample-with-manual-sections.archon.md'),
  'utf-8'
);
expect(withManual).toContain('<!-- archon:manual -->');

// Test orphaned detection
const orphaned = await readFile(
  join(fixturesDir, 'sample-orphaned.archon.md'),
  'utf-8'
);
expect(orphaned).toContain('<!-- archon:orphaned -->');
```

## Requirements Coverage

| Fixture | Requirements |
|---------|--------------|
| `sample-with-manual-sections.archon.md` | 4.5 (Manual section preservation) |
| `sample-orphaned.archon.md` | 4.9 (Orphaned documentation marking) |
| `sample-unicode.archon.md` | Unicode handling |
| `sample-large-file.archon.md` | Complex file documentation |

**Source**
- `src/lib/doc_generator.ts` - Documentation generator implementation
- `src/tools/doc_generation.ts` - Documentation generation tool
- `.kiro/specs/documentation-tools/requirements.md` - Requirements specification
