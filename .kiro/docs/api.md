<<<<<<< HEAD
# Archon Documentation MCP Tools API

## MCP Tool Interface Overview

This package exposes five MCP tools that Kiro agents invoke for code intelligence and documentation operations. All tools follow a consistent request/response pattern with typed input and output schemas.

**Tool Communication:**
- Tools are invoked via the Model Context Protocol (MCP)
- All inputs and outputs are JSON-serializable TypeScript interfaces
- Tools return structured responses with `success` boolean and optional `errors` array
- Partial failures are reported in the `errors` array while `success` may still be `true`

**Source**
- `src/server.ts` - MCP server entry point
- `src/types/tools.ts` - Tool input/output type definitions

## generate_scip_index Tool

Generates SCIP (Source Code Index Protocol) indexes for a package by detecting languages and invoking appropriate SCIP tools (`scip-go`, `scip-typescript`).

### Input Schema

```typescript
interface GenerateScipIndexInput {
  packagePath: string;      // Path to the package to index
  force?: boolean;          // Force re-index even if unchanged (default: false)
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `packagePath` | `string` | Yes | Absolute or relative path to the package directory |
| `force` | `boolean` | No | When `true`, re-indexes regardless of cached hash |

### Output Schema

```typescript
interface GenerateScipIndexOutput {
  success: boolean;
  packagePath: string;
  languagesDetected: ('go' | 'typescript')[];
  indexes: {
    language: 'go' | 'typescript';
    indexPath: string;
    symbolCount: number;
    hash: string;
  }[];
  errors?: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if indexing completed without fatal errors |
| `packagePath` | `string` | Echoed input path for correlation |
| `languagesDetected` | `string[]` | Languages found in the package |
| `indexes` | `object[]` | Generated index details per language |
| `indexes[].language` | `string` | Language of this index |
| `indexes[].indexPath` | `string` | Path to generated `.scip` file |
| `indexes[].symbolCount` | `number` | Number of symbols indexed |
| `indexes[].hash` | `string` | SHA-256 hash for change detection |
| `errors` | `string[]` | Error messages if any issues occurred |

### Example Usage

**Request:**
```json
{
  "packagePath": "/workspace/AphexKnowledgeBaseMCPTools",
  "force": false
}
```

**Response:**
```json
{
  "success": true,
  "packagePath": "/workspace/AphexKnowledgeBaseMCPTools",
  "languagesDetected": ["typescript"],
  "indexes": [
    {
      "language": "typescript",
      "indexPath": "/workspace/AphexKnowledgeBaseMCPTools/.archon/scip/index.ts.scip",
      "symbolCount": 142,
      "hash": "a1b2c3d4e5f6..."
    }
  ]
}
```

**Source**
- `src/tools/scip_indexing.ts` - Tool implementation
- `src/lib/language_detector.ts` - Language detection logic

## generate_archon_doc Tool

Generates plain English documentation from SCIP indexes with ARN references. Creates `<name>.archon.md` files co-located with source files.

### Input Schema

```typescript
interface GenerateArchonDocInput {
  packagePath: string;      // Path to the package
  files?: string[];         // Optional: specific files to document
  force?: boolean;          // Force regeneration even if unchanged (default: false)
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `packagePath` | `string` | Yes | Path to the package directory |
| `files` | `string[]` | No | Limit documentation to specific source files |
| `force` | `boolean` | No | When `true`, regenerates all docs regardless of hash |

### Output Schema

```typescript
interface GenerateArchonDocOutput {
  success: boolean;
  packagePath: string;
  filesGenerated: {
    sourcePath: string;
    docPath: string;
    arn: string;
  }[];
  filesSkipped: string[];
  errors?: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if generation completed without fatal errors |
| `packagePath` | `string` | Echoed input path for correlation |
| `filesGenerated` | `object[]` | Details of generated documentation files |
| `filesGenerated[].sourcePath` | `string` | Path to source file |
| `filesGenerated[].docPath` | `string` | Path to generated `.archon.md` file |
| `filesGenerated[].arn` | `string` | ARN of the generated documentation |
| `filesSkipped` | `string[]` | Files skipped due to unchanged index hash |
| `errors` | `string[]` | Error messages if any issues occurred |

### Example Usage

**Request:**
```json
{
  "packagePath": "/workspace/AphexKnowledgeBaseMCPTools",
  "files": ["src/lib/arn.ts"]
}
```

**Response:**
```json
{
  "success": true,
  "packagePath": "/workspace/AphexKnowledgeBaseMCPTools",
  "filesGenerated": [
    {
      "sourcePath": "src/lib/arn.ts",
      "docPath": "src/lib/arn.archon.md",
      "arn": "arn:archon:doc:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts"
    }
  ],
  "filesSkipped": []
}
```

**Source**
- `src/tools/doc_generation.ts` - Tool implementation
- `src/lib/doc_generator.ts` - Documentation generation logic

## resolve_arn Tool

Resolves an ARN (Archon Resource Name) to its file location and symbol information. Supports both `code` and `doc` ARN types.

### Input Schema

```typescript
interface ResolveArnInput {
  arn: string;              // ARN to resolve
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `arn` | `string` | Yes | Full ARN string to resolve |

### Output Schema

```typescript
interface ResolveArnOutput {
  success: boolean;
  arn: string;
  resolved: {
    type: 'code' | 'doc' | 'k8s' | 'infra';
    workspace: string;
    package: string;
    path: string;
    symbol?: string;
    filePath: string;
    lineNumber?: number;
  } | null;
  error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if ARN was successfully resolved |
| `arn` | `string` | Echoed input ARN for correlation |
| `resolved` | `object \| null` | Resolution result, `null` if not found |
| `resolved.type` | `string` | Resource type from ARN |
| `resolved.workspace` | `string` | Workspace identifier |
| `resolved.package` | `string` | Package name |
| `resolved.path` | `string` | Relative file path within package |
| `resolved.symbol` | `string` | Symbol name (if present in ARN) |
| `resolved.filePath` | `string` | Absolute file path on disk |
| `resolved.lineNumber` | `number` | Line number of symbol definition |
| `error` | `string` | Error message if resolution failed |

### Example Usage

**Request:**
```json
{
  "arn": "arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#ArnLibrary"
}
```

**Response:**
```json
{
  "success": true,
  "arn": "arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#ArnLibrary",
  "resolved": {
    "type": "code",
    "workspace": "personal-work",
    "package": "AphexKnowledgeBaseMCPTools",
    "path": "src/lib/arn.ts",
    "symbol": "ArnLibrary",
    "filePath": "/workspace/AphexKnowledgeBaseMCPTools/src/lib/arn.ts",
    "lineNumber": 45
  }
}
```

**Source**
- `src/tools/arn_resolution.ts` - Tool implementation
- `src/lib/arn.ts` - ARN parsing logic

## index_workspace Tool

Orchestrates SCIP indexing across all packages in a workspace. Discovers packages, processes in dependency order, and tracks changes for incremental updates.

### Input Schema

```typescript
interface IndexWorkspaceInput {
  workspacePath: string;    // Path to workspace root
  packages?: string[];      // Optional: specific packages to index
  force?: boolean;          // Force re-index all packages (default: false)
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspacePath` | `string` | Yes | Path to workspace root directory |
| `packages` | `string[]` | No | Limit indexing to specific package names |
| `force` | `boolean` | No | When `true`, re-indexes all packages regardless of cache |

### Output Schema

```typescript
interface IndexWorkspaceOutput {
  success: boolean;
  workspacePath: string;
  packagesIndexed: {
    package: string;
    languages: ('go' | 'typescript')[];
    symbolCount: number;
  }[];
  packagesSkipped: string[];
  totalSymbols: number;
  errors: {
    package: string;
    error: string;
  }[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if indexing completed (may have partial failures) |
| `workspacePath` | `string` | Echoed input path for correlation |
| `packagesIndexed` | `object[]` | Successfully indexed packages |
| `packagesIndexed[].package` | `string` | Package name |
| `packagesIndexed[].languages` | `string[]` | Languages indexed in this package |
| `packagesIndexed[].symbolCount` | `number` | Total symbols indexed |
| `packagesSkipped` | `string[]` | Packages skipped (unchanged since last index) |
| `totalSymbols` | `number` | Sum of all symbols across packages |
| `errors` | `object[]` | Per-package error details |
| `errors[].package` | `string` | Package that failed |
| `errors[].error` | `string` | Error message |

### Example Usage

**Request:**
```json
{
  "workspacePath": "/workspace",
  "packages": ["AphexKnowledgeBaseMCPTools", "AphexCLI"],
  "force": false
}
```

**Response:**
```json
{
  "success": true,
  "workspacePath": "/workspace",
  "packagesIndexed": [
    {
      "package": "AphexKnowledgeBaseMCPTools",
      "languages": ["typescript"],
      "symbolCount": 142
    },
    {
      "package": "AphexCLI",
      "languages": ["go"],
      "symbolCount": 89
    }
  ],
  "packagesSkipped": [],
  "totalSymbols": 231,
  "errors": []
}
```

**Source**
- `src/tools/workspace_indexing.ts` - Tool implementation

## document_workspace Tool

Orchestrates documentation generation across all packages in a workspace. Only generates docs for packages with changed SCIP indexes.

### Input Schema

```typescript
interface DocumentWorkspaceInput {
  workspacePath: string;    // Path to workspace root
  packages?: string[];      // Optional: specific packages to document
  force?: boolean;          // Force regeneration (default: false)
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspacePath` | `string` | Yes | Path to workspace root directory |
| `packages` | `string[]` | No | Limit documentation to specific package names |
| `force` | `boolean` | No | When `true`, regenerates all docs regardless of cache |

### Output Schema

```typescript
interface DocumentWorkspaceOutput {
  success: boolean;
  workspacePath: string;
  packagesDocumented: {
    package: string;
    filesGenerated: number;
    arnsCreated: string[];
  }[];
  packagesSkipped: string[];
  totalFilesGenerated: number;
  totalArns: number;
  errors: {
    package: string;
    error: string;
  }[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if documentation completed (may have partial failures) |
| `workspacePath` | `string` | Echoed input path for correlation |
| `packagesDocumented` | `object[]` | Successfully documented packages |
| `packagesDocumented[].package` | `string` | Package name |
| `packagesDocumented[].filesGenerated` | `number` | Count of `.archon.md` files created |
| `packagesDocumented[].arnsCreated` | `string[]` | ARNs of generated documentation |
| `packagesSkipped` | `string[]` | Packages skipped (unchanged index hash) |
| `totalFilesGenerated` | `number` | Sum of all files generated |
| `totalArns` | `number` | Sum of all ARNs created |
| `errors` | `object[]` | Per-package error details |

### Example Usage

**Request:**
```json
{
  "workspacePath": "/workspace",
  "force": true
}
```

**Response:**
```json
{
  "success": true,
  "workspacePath": "/workspace",
  "packagesDocumented": [
    {
      "package": "AphexKnowledgeBaseMCPTools",
      "filesGenerated": 8,
      "arnsCreated": [
        "arn:archon:doc:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts",
        "arn:archon:doc:personal-work/AphexKnowledgeBaseMCPTools/src/lib/scip_parser.ts"
      ]
    }
  ],
  "packagesSkipped": [],
  "totalFilesGenerated": 8,
  "totalArns": 8,
  "errors": []
}
```

**Source**
- `src/tools/workspace_docs.ts` - Tool implementation

## Error Response Format

All tools follow a consistent error reporting pattern. Errors are categorized by severity and recoverability.

### Error Categories

| Category | Description | Example |
|----------|-------------|---------|
| **Tool Not Installed** | Required SCIP tool missing | `scip-typescript not found` |
| **Invalid Input** | Malformed or missing parameters | `packagePath is required` |
| **File System Error** | Permission or path issues | `Permission denied: /path` |
| **Parse Error** | Malformed SCIP index or ARN | `Invalid ARN format` |
| **Partial Failure** | Some operations succeeded | Package-level errors in array |

### Error Response Structure

```typescript
// Fatal error (success: false)
{
  "success": false,
  "error": "scip-typescript not installed. Install with: npm install -g @sourcegraph/scip-typescript"
}

// Partial failure (success: true with errors array)
{
  "success": true,
  "packagesIndexed": [...],
  "errors": [
    {
      "package": "BrokenPackage",
      "error": "go.mod parse error: invalid module path"
    }
  ]
}
```

### Common Error Messages

| Error | Cause | Resolution |
|-------|-------|------------|
| `scip-go not installed` | Go SCIP tool missing | `go install github.com/sourcegraph/scip-go@latest` |
| `scip-typescript not installed` | TS SCIP tool missing | `npm install -g @sourcegraph/scip-typescript` |
| `Invalid ARN format` | Malformed ARN string | Check ARN format: `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>` |
| `Package path does not exist` | Invalid path provided | Verify path exists and is accessible |
| `SCIP index not found` | Indexing not run first | Run `generate_scip_index` before `generate_archon_doc` |

**Source**
- `src/types/tools.ts` - Error type definitions

## ARN Library Public API

The ARN library provides programmatic access to ARN generation, parsing, and validation. This is the core library used by all tools for cross-referencing.

### ARN Format

```
arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
```

### Type Definitions

```typescript
type ArnType = 'code' | 'doc' | 'k8s' | 'infra';

interface ArnComponents {
  type: ArnType;
  workspace: string;
  package: string;
  path: string;
  symbol?: string;
}

interface ArnValidationResult {
  valid: boolean;
  error?: string;
}
```

### Library Interface

```typescript
interface ArnLibrary {
  /** Generate ARN string from components (deterministic) */
  generate(components: ArnComponents): string;
  
  /** Parse ARN string to components (returns null if invalid) */
  parse(arn: string): ArnComponents | null;
  
  /** Validate ARN format with detailed error message */
  validate(arn: string): ArnValidationResult;
  
  /** Normalize path (remove ./, resolve ..) */
  normalizePath(path: string): string;
  
  /** Escape special characters in symbol (/, #, %) */
  escapeSymbol(symbol: string): string;
  
  /** Unescape symbol from ARN encoding */
  unescapeSymbol(escaped: string): string;
}
```

### Escaping Rules

| Character | Escaped | Example |
|-----------|---------|---------|
| `/` | `%2F` | `Class/Method` → `Class%2FMethod` |
| `#` | `%23` | `func#1` → `func%231` |
| `%` | `%25` | `100%` → `100%25` |

### Usage Examples

```typescript
import { arnLibrary } from './lib/arn';

// Generate ARN
const arn = arnLibrary.generate({
  type: 'code',
  workspace: 'personal-work',
  package: 'AphexKnowledgeBaseMCPTools',
  path: 'src/lib/arn.ts',
  symbol: 'ArnLibrary'
});
// Result: "arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#ArnLibrary"

// Parse ARN
const components = arnLibrary.parse(arn);
// Result: { type: 'code', workspace: 'personal-work', ... }

// Validate ARN
const result = arnLibrary.validate('invalid-arn');
// Result: { valid: false, error: 'ARN must start with arn:archon:' }
```

**Source**
- `src/lib/arn.ts` - ARN library implementation
- `src/types/arn.ts` - ARN type definitions
=======
# API

## Overview

[Describe the API purpose and design]

## Endpoints

[Document API endpoints, methods, and parameters]

## Authentication

[Describe authentication mechanisms]

## Request/Response Formats

[Document request and response formats]

## Error Handling

[Describe error codes and handling]

## Integration Examples

[Provide integration examples]

**Source**
[Add references to relevant API implementation files]
>>>>>>> aaf307eb5fccd13f2011729bcfa32111e464d9e2
