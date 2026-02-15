# SCIP Test Fixtures

This directory contains SCIP (Source Code Intelligence Protocol) index test fixtures for unit tests and property-based tests.

## Fixture Types

### Valid Indexes

- **valid-simple.scip** - A simple valid SCIP index with a single function symbol
- **valid-multi-symbol.scip** - A valid SCIP index with multiple symbol kinds (function, class, method, module, variable, type)
- **valid-with-relationships.scip** - A valid SCIP index with various relationship types (contains, references, implements, extends, imports)

### Empty Indexes

- **empty.scip** - A valid but empty SCIP index with no documents or symbols

### Malformed Indexes

- **malformed-truncated.scip** - A truncated/incomplete SCIP file (corrupted binary)
- **malformed-invalid-protobuf.scip** - Invalid protobuf data that cannot be decoded
- **malformed-wrong-schema.scip** - Valid protobuf but wrong message type

## Fixture Generation

These fixtures are generated using the `generate-fixtures.ts` script. To regenerate:

```bash
npx tsx tests/fixtures/scip/generate-fixtures.ts
```

## JSON Representations

Each binary fixture has a corresponding `.json` file that documents its structure for reference. These JSON files are not used by tests but serve as documentation.

## Usage in Tests

```typescript
import { join } from 'path';
import { readFile } from 'fs/promises';

const fixturesDir = join(__dirname, '..', 'fixtures', 'scip');
const validIndex = await readFile(join(fixturesDir, 'valid-simple.scip'));
```

## SCIP Protocol Reference

SCIP indexes are Protocol Buffer encoded files following the schema in `src/proto/scip.proto`. Key structures:

- **Index**: Root message containing metadata, documents, and external symbols
- **Document**: Represents a source file with symbols and occurrences
- **SymbolInformation**: Metadata about a symbol (name, kind, documentation, relationships)
- **Occurrence**: A reference or definition of a symbol at a specific location
- **Relationship**: Links between symbols (implements, extends, references, etc.)

**Source**
- `src/proto/scip.proto` - SCIP Protocol Buffer definition
- `src/types/scip.ts` - TypeScript type definitions
- `src/lib/scip_parser.ts` - SCIP parser implementation
