# Archon Documentation MCP Tools Data Models

## ARN (Archon Resource Name) Format

ARNs provide deterministic identifiers for resources in the Archon system, enabling stable cross-references between code, documentation, and infrastructure.

### ARN Structure

```
arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
```

### ARN Components

| Component | Required | Description | Example |
|-----------|----------|-------------|---------|
| `arn:archon:` | Yes | Fixed prefix | Always `arn:archon:` |
| `type` | Yes | Resource type | `code`, `doc`, `k8s`, `infra` |
| `workspace` | Yes | Workspace identifier | `personal-work` |
| `package` | Yes | Package/repository name | `AphexKnowledgeBaseMCPTools` |
| `path` | Yes | File path relative to package | `src/lib/arn.ts` |
| `symbol` | No | Symbol name within file | `ArnLibrary.generate` |

### Supported ARN Types

| Type | Description | Example Use |
|------|-------------|-------------|
| `code` | Source code symbols | Functions, classes, methods |
| `doc` | Documentation files | `.archon.md` files |
| `k8s` | Kubernetes resources | Deployments, services |
| `infra` | Infrastructure definitions | CDK stacks, Terraform |

### ARN Examples

```
# Code symbol ARN
arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#ArnLibrary

# Documentation ARN
arn:archon:doc:personal-work/ArchonAgent/src/orchestrator/main.py

# Code ARN without symbol (file-level)
arn:archon:code:personal-work/AphexCLI/cmd/root.go

# Code ARN with method
arn:archon:code:personal-work/AphexCLI/cmd/root.go#Execute
```

### ARN Escaping Rules

Special characters in symbol names must be escaped:

| Character | Escaped | Example |
|-----------|---------|---------|
| `/` | `%2F` | `Class/Method` → `Class%2FMethod` |
| `#` | `%23` | `func#1` → `func%231` |
| `%` | `%25` | `100%` → `100%25` |

**Source**
- `src/lib/arn.ts` - ARN library implementation
- `src/types/arn.ts` - ARN type definitions

## SCIP Index Storage Structure

Each package stores SCIP indexes in a standardized `.archon/scip/` directory.

### Directory Structure

```
<package>/
├── .archon/
│   └── scip/
│       ├── index.scip           # SCIP index (single language)
│       ├── index.go.scip        # Go-specific index (multi-language)
│       ├── index.ts.scip        # TypeScript-specific index (multi-language)
│       └── metadata.json        # Index metadata and hashes
```

### Single vs Multi-Language Packages

**Single Language Package:**
- One `index.scip` file containing all symbols

**Multi-Language Package (Go + TypeScript):**
- `index.go.scip` for Go symbols
- `index.ts.scip` for TypeScript symbols
- Both referenced in `metadata.json`

**Source**
- `src/tools/scip_indexing.ts` - Index storage logic

## SCIP Metadata Schema

The `metadata.json` file tracks index state for incremental processing.

### Schema Definition

```typescript
interface ScipMetadata {
  packagePath: string;          // Absolute path to package
  lastIndexed: string;          // ISO 8601 timestamp
  indexes: IndexEntry[];        // Per-language index entries
}

interface IndexEntry {
  language: 'go' | 'typescript';
  indexFile: string;            // Relative path to .scip file
  hash: string;                 // SHA-256 hash of index content
  symbolCount: number;          // Number of symbols in index
}
```

### Example metadata.json

```json
{
  "packagePath": "/workspace/AphexKnowledgeBaseMCPTools",
  "lastIndexed": "2024-01-15T10:30:00Z",
  "indexes": [
    {
      "language": "typescript",
      "indexFile": "index.ts.scip",
      "hash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
      "symbolCount": 142
    }
  ]
}
```

### Hash Computation

Index hashes are computed using SHA-256 over the raw SCIP index file content:

```typescript
import { createHash } from 'crypto';

function computeIndexHash(indexContent: Buffer): string {
  return createHash('sha256').update(indexContent).digest('hex');
}
```

**Source**
- `src/tools/scip_indexing.ts` - Metadata generation
- `src/lib/scip_parser.ts` - Hash computation

## SCIP Symbol Data Model

Symbols extracted from SCIP indexes follow a structured format.

### Symbol Schema

```typescript
interface ScipSymbol {
  name: string;                 // Symbol name (e.g., "ArnLibrary")
  kind: SymbolKind;             // Symbol type
  signature: string;            // Full signature with types
  documentation?: string;       // Extracted doc comments
  location: SymbolLocation;     // File and position
  arn: string;                  // Generated ARN for this symbol
}

type SymbolKind = 
  | 'function' 
  | 'class' 
  | 'method' 
  | 'variable' 
  | 'type' 
  | 'module';

interface SymbolLocation {
  file: string;                 // Relative file path
  line: number;                 // 1-indexed line number
  column: number;               // 0-indexed column number
}
```

### Symbol Relationship Schema

```typescript
interface ScipRelationship {
  from: string;                 // Source ARN
  to: string;                   // Target ARN
  type: RelationshipType;       // Relationship kind
}

type RelationshipType = 
  | 'contains'                  // Parent contains child
  | 'references'                // Symbol references another
  | 'implements'                // Class implements interface
  | 'extends'                   // Class extends another
  | 'imports';                  // Module imports another
```

### Parse Result Schema

```typescript
interface ScipParseResult {
  symbols: ScipSymbol[];        // All extracted symbols
  relationships: ScipRelationship[];  // Symbol relationships
  hash: string;                 // Index content hash
}
```

**Source**
- `src/lib/scip_parser.ts` - Symbol extraction logic
- `src/types/scip.ts` - SCIP type definitions

## Archon Documentation Format

Generated documentation files follow a structured Markdown format with metadata headers.

### Document Structure

```markdown
# <Symbol Name>

<!-- archon:generated -->
<!-- arn: arn:archon:doc:workspace/package/path -->
<!-- source: arn:archon:code:workspace/package/path#symbol -->
<!-- index-hash: abc123... -->

## Purpose

<Plain English description of what this code does>

## Public API

### <Function/Method Name>

<Description>

**Parameters:**
- `param1`: <description>

**Returns:** <description>

**Related:**
- [RelatedSymbol](arn:archon:code:workspace/package/path#RelatedSymbol)

<!-- archon:manual -->
## Notes

<User-added content preserved across regenerations>

<!-- /archon:manual -->
```

### Metadata Comments

| Comment | Purpose |
|---------|---------|
| `<!-- archon:generated -->` | Marks file as auto-generated |
| `<!-- arn: ... -->` | ARN of this documentation file |
| `<!-- source: ... -->` | ARN of the source code being documented |
| `<!-- index-hash: ... -->` | SCIP index hash for change detection |
| `<!-- archon:manual -->` | Start of user-editable section |
| `<!-- /archon:manual -->` | End of user-editable section |

### File Naming Convention

Documentation files are co-located with source files:

| Source File | Documentation File |
|-------------|-------------------|
| `arn.ts` | `arn.archon.md` |
| `scip_parser.ts` | `scip_parser.archon.md` |
| `handler.go` | `handler.archon.md` |

**Source**
- `src/lib/doc_generator.ts` - Documentation generation logic

## Workspace Configuration Schema

Optional workspace-level configuration for documentation tools.

### Schema Definition

```yaml
# .archon/workspace.yaml
workspace: string              # Workspace identifier
packages:                      # Package definitions
  - name: string               # Package name
    path: string               # Relative path from workspace root
    languages: string[]        # Supported languages: go, typescript
```

### Example Configuration

```yaml
workspace: personal-work
packages:
  - name: AphexKnowledgeBaseMCPTools
    path: ./AphexKnowledgeBaseMCPTools
    languages: [typescript]
  - name: ArchonAgent
    path: ./ArchonAgent
    languages: [python]
  - name: AphexCLI
    path: ./AphexCLI
    languages: [go]
```

**Source**
- `.kiro/specs/archon-agent-pipeline/design.md` - Workspace configuration design

## Index Hash Store Schema

Workspace-level hash tracking for incremental processing.

### Schema Definition

```typescript
interface HashStore {
  packages: {
    [packageName: string]: {
      [language: string]: {
        hash: string;           // SHA-256 hash
        lastUpdated: string;    // ISO 8601 timestamp
      };
    };
  };
}
```

### Storage Location

```
<workspace>/.archon/hashes.json
```

### Example Hash Store

```json
{
  "packages": {
    "AphexKnowledgeBaseMCPTools": {
      "typescript": {
        "hash": "a1b2c3d4e5f6...",
        "lastUpdated": "2024-01-15T10:30:00Z"
      }
    },
    "AphexCLI": {
      "go": {
        "hash": "f6e5d4c3b2a1...",
        "lastUpdated": "2024-01-15T09:15:00Z"
      }
    }
  }
}
```

**Source**
- `src/tools/workspace_indexing.ts` - Hash store management

