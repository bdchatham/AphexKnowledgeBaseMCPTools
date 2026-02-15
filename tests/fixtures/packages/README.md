# Package Structure Test Fixtures

This directory contains sample package structures for testing language detection and workspace indexing functionality.

## Fixture Types

### Go-Only Package (`go-only/`)

A minimal Go package containing:
- `go.mod` - Go module definition
- `main.go` - Main package entry point
- `utils.go` - Utility functions

**Use Case:** Testing Go language detection (Requirement 1.3)

### TypeScript-Only Package (`typescript-only/`)

A minimal TypeScript/Node.js package containing:
- `package.json` - Node.js package definition
- `tsconfig.json` - TypeScript configuration
- `src/index.ts` - Main entry point
- `src/utils.ts` - Utility functions

**Use Case:** Testing TypeScript/JavaScript language detection (Requirement 1.4)

### Multi-Language Package (`multi-language/`)

A package containing both Go and TypeScript code:
- `go.mod` - Go module definition
- `package.json` - Node.js package definition
- `main.go` - Go entry point
- `src/index.ts` - TypeScript entry point

**Use Case:** Testing multi-language detection and indexing (Requirement 1.7)

### Nested Packages (`nested-packages/`)

A workspace with packages at various nesting depths:
```
nested-packages/
├── package.json          # Root TypeScript package
├── packages/
│   ├── core/
│   │   └── package.json  # Nested TypeScript package (depth 2)
│   └── utils/
│       └── go.mod        # Nested Go package (depth 2)
└── services/
    └── api/
        └── go.mod        # Deeply nested Go package (depth 3)
```

**Use Case:** Testing workspace package discovery at various depths (Requirement 6.3)

### Empty Package (`empty-package/`)

An empty directory with only a `.gitkeep` file.

**Use Case:** Testing edge case handling for empty directories

## Usage in Tests

```typescript
import { join } from 'path';

const fixturesDir = join(__dirname, '..', 'fixtures', 'packages');

// Test Go-only detection
const goOnlyPath = join(fixturesDir, 'go-only');
const result = await detect(goOnlyPath);
expect(result.hasGo).toBe(true);
expect(result.hasTypeScript).toBe(false);

// Test workspace discovery
const nestedPath = join(fixturesDir, 'nested-packages');
const packages = await discoverPackages(nestedPath);
expect(packages.length).toBe(4); // root + 3 nested
```

## Requirements Coverage

| Fixture | Requirements |
|---------|--------------|
| `go-only/` | 1.3 (Go detection) |
| `typescript-only/` | 1.4 (TypeScript detection) |
| `multi-language/` | 1.3, 1.4, 1.7 (Multi-language handling) |
| `nested-packages/` | 6.3 (Package discovery) |
| `empty-package/` | Edge case handling |

**Source**
- `src/lib/language_detector.ts` - Language detection implementation
- `src/tools/workspace_indexing.ts` - Workspace indexing tool
- `.kiro/specs/documentation-tools/requirements.md` - Requirements specification
