# Design Document: Documentation Tools MCP Package

## Overview

This design document specifies the implementation of MCP tools for SCIP indexing and Archon documentation generation within the AphexKnowledgeBaseMCPTools package. These tools enable Kiro agents to maintain precise code intelligence and generate plain English documentation with deterministic cross-references.

**This is a child spec** - it implements the code intelligence foundation defined in the root specification at `.kiro/specs/archon-agent-pipeline/`. This document focuses on implementation details specific to this package while referencing the root spec for broader architectural context.

### Design Principles

1. **MCP-First Architecture**: All functionality is exposed as MCP tools that Kiro can invoke
2. **Deterministic Outputs**: Same inputs always produce same ARNs and index hashes
3. **Incremental Processing**: Only regenerate when SCIP indexes actually change
4. **Language Detection**: Automatically detect Go and JavaScript/TypeScript in packages
5. **Co-located Documentation**: `<name>.archon.md` files live next to source code

### Package Scope

This package implements:
- **6 MCP Tools**: `generate_scip_index`, `generate_archon_doc`, `resolve_arn`, `index_workspace`, `document_workspace`, `sync_to_knowledge_base`
- **5 Core Libraries**: ARN generation, SCIP parsing, language detection, documentation generation, sync service client
- **Type Definitions**: Shared types for tools and libraries

## Architecture

### Package Structure

```
AphexKnowledgeBaseMCPTools/
├── src/
│   ├── server.ts                 # MCP server entry point
│   ├── tools/
│   │   ├── scip_indexing.ts      # SCIP indexing tool
│   │   ├── doc_generation.ts     # Documentation generation tool
│   │   ├── arn_resolution.ts     # ARN resolution tool
│   │   ├── workspace_indexing.ts # Workspace indexing playbook
│   │   ├── workspace_docs.ts     # Workspace documentation playbook
│   │   └── sync_to_knowledge_base.ts  # Knowledge base sync tool
│   ├── lib/
│   │   ├── arn.ts                # ARN generation and parsing
│   │   ├── scip_parser.ts        # SCIP index parser
│   │   ├── doc_generator.ts      # Documentation generator
│   │   ├── language_detector.ts  # Go/TypeScript detection
│   │   └── sync_client.ts        # HTTP client for sync service API
│   └── types/
│       ├── arn.ts                # ARN type definitions
│       ├── scip.ts               # SCIP-related types
│       └── tools.ts              # Tool input/output types
├── tests/
│   ├── unit/                     # Unit tests
│   │   ├── arn.test.ts
│   │   ├── scip_parser.test.ts
│   │   ├── doc_generator.test.ts
│   │   ├── language_detector.test.ts
│   │   └── sync_to_knowledge_base.test.ts
│   └── property/                 # Property-based tests
│       ├── arn.property.test.ts
│       ├── scip_parser.property.test.ts
│       └── doc_generator.property.test.ts
├── package.json
├── tsconfig.json
└── .kiro/
    └── specs/
        └── documentation-tools/  # This spec
```

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Package   │────▶│   Language  │────▶│   SCIP      │────▶│   SCIP      │
│   Source    │     │   Detector  │     │   Tool      │     │   Index     │
│   Code      │     │             │     │ (go/ts)     │     │   File      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                  │
                                                                  ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Archon    │◀────│   Doc       │◀────│   SCIP      │◀────│   Index     │
│   Doc       │     │   Generator │     │   Parser    │     │   Hash      │
│   (.md)     │     │             │     │             │     │   Store     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sync      │────▶│   Sync      │────▶│   Knowledge │
│   Tool      │     │   Service   │     │   Base      │
│             │     │   API       │     │ (Graph+Vec) │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Component Interfaces

### MCP Tool: generate_scip_index

Generates SCIP indexes for a package by detecting languages and invoking appropriate SCIP tools.

**Input Schema:**
```typescript
interface GenerateScipIndexInput {
  packagePath: string;      // Path to the package to index
  force?: boolean;          // Force re-index even if unchanged
}
```

**Output Schema:**
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

**Validates: Requirements 1.1-1.11**

### MCP Tool: generate_archon_doc

Generates plain English documentation from SCIP indexes with ARN references.

**Input Schema:**
```typescript
interface GenerateArchonDocInput {
  packagePath: string;      // Path to the package
  files?: string[];         // Optional: specific files to document
  force?: boolean;          // Force regeneration even if unchanged
}
```

**Output Schema:**
```typescript
interface GenerateArchonDocOutput {
  success: boolean;
  packagePath: string;
  filesGenerated: {
    sourcePath: string;
    docPath: string;
    arn: string;
  }[];
  filesSkipped: string[];   // Unchanged files
  errors?: string[];
}
```

**Validates: Requirements 4.1-4.9**

### MCP Tool: resolve_arn

Resolves an ARN to its file location and symbol information.

**Input Schema:**
```typescript
interface ResolveArnInput {
  arn: string;              // ARN to resolve
}
```

**Output Schema:**
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
    filePath: string;       // Absolute file path
    lineNumber?: number;
  } | null;
  error?: string;
}
```

**Validates: Requirements 5.1-5.5**

### MCP Tool: index_workspace

Orchestrates SCIP indexing across all packages in a workspace.

**Input Schema:**
```typescript
interface IndexWorkspaceInput {
  workspacePath: string;    // Path to workspace root
  packages?: string[];      // Optional: specific packages to index
  force?: boolean;          // Force re-index all packages
}
```

**Output Schema:**
```typescript
interface IndexWorkspaceOutput {
  success: boolean;
  workspacePath: string;
  packagesIndexed: {
    package: string;
    languages: ('go' | 'typescript')[];
    symbolCount: number;
  }[];
  packagesSkipped: string[];  // Unchanged packages
  totalSymbols: number;
  errors: {
    package: string;
    error: string;
  }[];
}
```

**Validates: Requirements 6.1-6.8**

### MCP Tool: document_workspace

Orchestrates documentation generation across all packages in a workspace.

**Input Schema:**
```typescript
interface DocumentWorkspaceInput {
  workspacePath: string;    // Path to workspace root
  packages?: string[];      // Optional: specific packages to document
  force?: boolean;          // Force regeneration
}
```

**Output Schema:**
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

**Validates: Requirements 7.1-7.7**

### MCP Tool: sync_to_knowledge_base

Synchronizes code intelligence data to the knowledge base by calling the sync service API in ArchonKnowledgeBaseInfrastructure.

**Input Schema:**
```typescript
interface SyncToKnowledgeBaseInput {
  workspacePath: string;    // Path to workspace root to sync
  packages?: string[];      // Optional: specific packages to sync
  force?: boolean;          // Force full sync (bypass change detection)
}
```

**Output Schema:**
```typescript
interface SyncToKnowledgeBaseOutput {
  success: boolean;
  packagesSynced: {
    package: string;
    graphNodesCreated: number;
    graphEdgesCreated: number;
    vectorChunksUpserted: number;
  }[];
  packagesSkipped: string[];
  errors: {
    package: string;
    error: string;
  }[];
}
```

**Integration:**
- Calls the sync service HTTP API at `http://archon-sync-service.archon.svc.cluster.local/sync`
- Supports both full sync mode (all packages) and incremental sync mode (only changed packages)
- Returns detailed sync results including Code Graph nodes/edges and Vector Store chunks

**Validates: Requirement 8.1-8.9**

## Core Library Interfaces

### ARN Library (`src/lib/arn.ts`)

**Types:**
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

**Interface:**
```typescript
interface ArnLibrary {
  /**
   * Generate ARN string from components.
   * Deterministic: same inputs always produce same output.
   */
  generate(components: ArnComponents): string;
  
  /**
   * Parse ARN string to components.
   * Returns null for invalid ARN format.
   */
  parse(arn: string): ArnComponents | null;
  
  /**
   * Validate ARN format and return detailed error if invalid.
   */
  validate(arn: string): ArnValidationResult;
  
  /**
   * Normalize path component by removing ./ and resolving ..
   */
  normalizePath(path: string): string;
  
  /**
   * Escape special characters in symbol for ARN encoding.
   * Escapes: / → %2F, # → %23, % → %25
   */
  escapeSymbol(symbol: string): string;
  
  /**
   * Unescape symbol from ARN encoding.
   */
  unescapeSymbol(escaped: string): string;
}
```

**Validates: Requirements 2.1-2.8**

### SCIP Parser (`src/lib/scip_parser.ts`)

**Types:**
```typescript
type SymbolKind = 'function' | 'class' | 'method' | 'variable' | 'type' | 'module';

type RelationshipType = 'contains' | 'references' | 'implements' | 'extends' | 'imports';

interface SymbolLocation {
  file: string;
  line: number;
  column: number;
}

interface ScipSymbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  documentation?: string;
  location: SymbolLocation;
  arn: string;
}

interface ScipRelationship {
  from: string;  // ARN
  to: string;    // ARN
  type: RelationshipType;
}

interface ScipParseResult {
  symbols: ScipSymbol[];
  relationships: ScipRelationship[];
  hash: string;
}

interface ScipParseError {
  message: string;
  file?: string;
  line?: number;
  recoverable: boolean;
}
```

**Interface:**
```typescript
interface ScipParser {
  /**
   * Parse SCIP index file and extract symbols with ARNs.
   * Computes hash for change detection.
   */
  parse(
    indexPath: string,
    workspace: string,
    packageName: string
  ): Promise<ScipParseResult>;
  
  /**
   * Check if index has changed by comparing hashes.
   */
  hasChanged(indexPath: string, storedHash: string): Promise<boolean>;
  
  /**
   * Parse incrementally, only processing changed files.
   * Preserves previously parsed data for unchanged files.
   */
  parseIncremental(
    indexPath: string,
    workspace: string,
    packageName: string,
    previousResult: ScipParseResult
  ): Promise<ScipParseResult>;
}
```

**Validates: Requirements 3.1-3.7**

### Language Detector (`src/lib/language_detector.ts`)

**Types:**
```typescript
interface LanguageDetectionResult {
  hasGo: boolean;
  hasTypeScript: boolean;
  goRoot?: string;      // Path to go.mod or directory with .go files
  tsRoot?: string;      // Path to package.json or directory with .ts/.js files
}
```

**Interface:**
```typescript
interface LanguageDetector {
  /**
   * Detect languages present in a package directory.
   * Checks for go.mod, .go files, package.json, .ts/.js files.
   */
  detect(packagePath: string): Promise<LanguageDetectionResult>;
}
```

**Validates: Requirements 1.3, 1.4**

### Documentation Generator (`src/lib/doc_generator.ts`)

**Types:**
```typescript
interface DocTemplate {
  kind: SymbolKind;
  template: string;
}

interface GeneratedDoc {
  sourcePath: string;
  docPath: string;
  content: string;
  arn: string;
  referencedArns: string[];
}

interface ManualSection {
  startMarker: string;
  endMarker: string;
  content: string;
}
```

**Interface:**
```typescript
interface DocGenerator {
  /**
   * Generate documentation for a symbol.
   * Includes ARN references to related symbols.
   */
  generateForSymbol(
    symbol: ScipSymbol,
    relationships: ScipRelationship[]
  ): GeneratedDoc;
  
  /**
   * Generate documentation for a file.
   * Creates <name>.archon.md co-located with source.
   */
  generateForFile(
    filePath: string,
    symbols: ScipSymbol[],
    relationships: ScipRelationship[]
  ): GeneratedDoc;
  
  /**
   * Preserve manual sections when regenerating.
   * Sections marked with <!-- archon:manual --> are preserved.
   */
  preserveManualSections(existingDoc: string, newDoc: string): string;
  
  /**
   * Check if doc needs regeneration based on index hash.
   */
  needsRegeneration(docPath: string, indexHash: string): Promise<boolean>;
  
  /**
   * Mark documentation as orphaned when source is deleted.
   */
  markOrphaned(docPath: string): Promise<void>;
}
```

**Validates: Requirements 4.2-4.9**

### Sync Service Client (`src/lib/sync_client.ts`)

**Types:**
```typescript
interface SyncServiceConfig {
  baseUrl: string;        // Base URL for sync service API
  timeout?: number;       // Request timeout in milliseconds
  retryAttempts?: number; // Number of retry attempts for transient failures
}

interface PackageSyncResult {
  package: string;
  graphNodesCreated: number;
  graphEdgesCreated: number;
  vectorChunksUpserted: number;
}

interface SyncServiceResponse {
  success: boolean;
  packagesSynced: PackageSyncResult[];
  packagesSkipped: string[];
  errors: {
    package: string;
    error: string;
  }[];
}
```

**Interface:**
```typescript
interface SyncServiceClient {
  /**
   * Sync workspace code intelligence to the knowledge base.
   * Calls the sync service HTTP API.
   */
  syncWorkspace(
    workspacePath: string,
    options?: {
      packages?: string[];
      force?: boolean;
    }
  ): Promise<SyncServiceResponse>;
  
  /**
   * Check if the sync service is available.
   * Returns true if the service responds to health check.
   */
  healthCheck(): Promise<boolean>;
}
```

**Error Handling:**
- Connection errors return descriptive message with retry guidance
- Timeout errors suggest increasing timeout or reducing batch size
- Service unavailable errors include service URL for debugging

**Validates: Requirements 8.5, 8.8**

## Data Models

### ARN Format

```
arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
```

**Components:**
| Component | Description | Example | Validation |
|-----------|-------------|---------|------------|
| `type` | Resource type | `code`, `doc`, `k8s`, `infra` | Must be one of valid types |
| `workspace` | Workspace identifier | `personal-work` | Non-empty string |
| `package` | Package/repository name | `AphexKnowledgeBaseMCPTools` | Non-empty string |
| `path` | File path relative to package | `src/lib/arn.ts` | Normalized path |
| `symbol` | Symbol name (optional) | `ARNLibrary.generate` | URL-encoded |

**Examples:**
```
arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#ARNLibrary
arn:archon:doc:personal-work/ArchonAgent/src/orchestrator/main.py
arn:archon:code:personal-work/AphexCLI/cmd/root.go#Execute
```

**Escaping Rules:**
- `/` in symbol names → `%2F`
- `#` in symbol names → `%23`
- `%` in symbol names → `%25`

**Validates: Requirements 2.2, 2.3, 2.7, 2.8**

### SCIP Index Storage

Each package stores its SCIP indexes in a standardized location:

```
<package>/
├── .archon/
│   └── scip/
│       ├── index.scip           # SCIP index file (single language)
│       ├── index.go.scip        # Go-specific index (multi-language)
│       ├── index.ts.scip        # TypeScript-specific index (multi-language)
│       └── metadata.json        # Index metadata and hashes
```

**metadata.json Schema:**
```typescript
interface ScipMetadata {
  packagePath: string;
  lastIndexed: string;          // ISO timestamp
  indexes: {
    language: 'go' | 'typescript';
    indexFile: string;
    hash: string;               // SHA-256 of index content
    symbolCount: number;
  }[];
}
```

**Validates: Requirements 1.8, 1.9**

### Archon Documentation Format

Documentation files follow the naming convention `<source-name>.archon.md`:

```
src/
├── lib/
│   ├── arn.ts
│   ├── arn.archon.md           # Documentation for arn.ts
│   ├── scip_parser.ts
│   └── scip_parser.archon.md   # Documentation for scip_parser.ts
```

**Document Structure:**
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

**Validates: Requirements 4.2, 4.4, 4.5**

### Index Hash Store

Track index hashes to detect changes at workspace level:

```typescript
interface HashStore {
  // File: <workspace>/.archon/hashes.json
  packages: {
    [packageName: string]: {
      [language: string]: {
        hash: string;
        lastUpdated: string;
      };
    };
  };
}
```

**Validates: Requirements 1.9, 4.6, 6.5**

## Correctness Properties

Properties define universal behaviors that must hold across all valid inputs. These properties are verified through property-based testing using fast-check.

### Property 1: Language Detection Accuracy

*For any* package directory structure, the language detector SHALL correctly identify the presence of Go (via `go.mod` or `.go` files) and TypeScript (via `package.json` or `.js`/`.ts` files), returning accurate detection results regardless of directory depth or file count.

**Validates: Requirements 1.3, 1.4**

### Property 2: Correct SCIP Tool Invocation

*For any* package with detected languages, the SCIP indexing tool SHALL invoke scip-go for Go packages and scip-typescript for TypeScript packages, with the tool selection being deterministic based on detected language.

**Validates: Requirements 1.5, 1.6**

### Property 3: Multi-Language Package Handling

*For any* package containing both Go and TypeScript code, the SCIP indexing tool SHALL generate separate indexes for each language, with both indexes present in the output.

**Validates: Requirement 1.7**

### Property 4: Index Output Location Consistency

*For any* successfully indexed package, the SCIP index files SHALL be written to `<package>/.archon/scip/` with consistent naming conventions.

**Validates: Requirement 1.8**

### Property 5: Index Hash Determinism

*For any* SCIP index content, computing the hash multiple times SHALL produce identical hash values, and identical index content across different runs SHALL produce identical hashes.

**Validates: Requirement 1.9**

### Property 6: ARN Format Compliance

*For any* valid ARN components (type, workspace, package, path, symbol), the generated ARN SHALL match the format `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>` and SHALL only accept valid type values (code, doc, k8s, infra).

**Validates: Requirements 2.2, 2.3**

### Property 7: ARN Round-Trip Consistency

*For any* valid ARN components, generating an ARN and then parsing it back SHALL return the original components unchanged. This implies determinism (same inputs → same ARN).

**Validates: Requirements 2.4, 2.5**

### Property 8: ARN Validation

*For any* malformed ARN string (missing components, invalid format, unknown type), the ARN library SHALL return a validation error with a descriptive message.

**Validates: Requirement 2.6**

### Property 9: ARN Component Normalization

*For any* path containing `./` or `..` segments, the ARN library SHALL normalize to a canonical form. *For any* symbol containing special characters (`/`, `#`, `%`), the library SHALL escape and unescape correctly, preserving the original symbol through round-trip.

**Validates: Requirements 2.7, 2.8**

### Property 10: SCIP Parsing Completeness

*For any* valid SCIP index file, the parser SHALL extract all symbols with their name, kind, signature, documentation, and location, SHALL assign valid ARNs to each symbol, and SHALL extract all relationships (contains, references, implements, extends).

**Validates: Requirements 3.2, 3.3, 3.4, 3.5**

### Property 11: Incremental Parsing Efficiency

*For any* SCIP index where only a subset of files have changed, incremental parsing SHALL only process changed files while preserving previously parsed data for unchanged files.

**Validates: Requirement 3.6**

### Property 12: Malformed SCIP Handling

*For any* malformed or corrupted SCIP index file, the parser SHALL return a graceful error with diagnostic information rather than crashing or producing invalid output.

**Validates: Requirement 3.7**

### Property 13: Documentation Co-location

*For any* source file at path `<dir>/<name>.<ext>`, the generated documentation SHALL be written to `<dir>/<name>.archon.md` in the same directory.

**Validates: Requirement 4.2**

### Property 14: Documentation Content Completeness

*For any* generated documentation file, the content SHALL include symbol information from the SCIP index and SHALL contain valid ARN references to related symbols.

**Validates: Requirements 4.3, 4.4**

### Property 15: Manual Section Preservation

*For any* existing documentation file containing `<!-- archon:manual -->` sections, regenerating the documentation SHALL preserve the content within those sections unchanged.

**Validates: Requirement 4.5**

### Property 16: Documentation Change Detection

*For any* package where the SCIP index hash has not changed since the last documentation generation, the documentation tool SHALL skip regeneration and report the files as skipped.

**Validates: Requirement 4.6**

### Property 17: ARN Resolution Correctness

*For any* valid ARN pointing to an existing resource, resolution SHALL return the correct file path, line number, and symbol information. *For any* ARN pointing to a non-existent resource, resolution SHALL return an appropriate error. Both code and doc ARN types SHALL be resolvable.

**Validates: Requirements 5.3, 5.4, 5.5**

### Property 18: Workspace Package Discovery

*For any* workspace directory structure, the workspace indexing tool SHALL discover all packages (directories containing `go.mod`, `package.json`, or other language markers) regardless of nesting depth.

**Validates: Requirement 6.3**

### Property 19: Dependency Order Processing

*For any* workspace with inter-package dependencies, the workspace indexing tool SHALL process packages in dependency order (dependencies before dependents).

**Validates: Requirement 6.4**

### Property 20: Force Parameter Behavior

*For any* workspace with unchanged packages, setting `force=true` SHALL cause all packages to be re-indexed/re-documented regardless of their change status. Setting `packages` parameter SHALL limit processing to only the specified packages.

**Validates: Requirements 6.7, 7.6**

## Error Handling

### SCIP Tool Errors

| Error Condition | Response | Recovery |
|-----------------|----------|----------|
| SCIP tool not installed | Return error with installation instructions | User installs tool |
| SCIP tool execution fails | Return error with stderr output | User fixes code issues |
| Invalid package path | Return error with path validation message | User provides valid path |
| No supported languages detected | Return success with empty indexes array | No action needed |

### ARN Errors

| Error Condition | Response | Recovery |
|-----------------|----------|----------|
| Malformed ARN string | Return validation error with format hint | User corrects ARN |
| Unknown ARN type | Return error listing valid types | User uses valid type |
| ARN resolution fails | Return error with ARN and reason | User verifies resource exists |

### Documentation Errors

| Error Condition | Response | Recovery |
|-----------------|----------|----------|
| SCIP index not found | Return error suggesting indexing first | User runs indexing |
| Write permission denied | Return error with path | User fixes permissions |
| Template rendering fails | Return error with symbol details | User reports bug |

### Workspace Errors

| Error Condition | Response | Recovery |
|-----------------|----------|----------|
| Workspace path invalid | Return error with validation message | User provides valid path |
| No packages found | Return success with empty results | No action needed |
| Partial failures | Return success with errors array | User addresses individual failures |

## Testing Strategy

### Dual Testing Approach

This specification requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all valid inputs

### Property-Based Testing Configuration

- **Library**: fast-check (TypeScript)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: documentation-tools, Property N: <property_text>`

### Test Categories

#### ARN Library Tests

**Property Tests:**
- Property 6: ARN format compliance
- Property 7: ARN round-trip consistency
- Property 8: ARN validation
- Property 9: ARN component normalization

**Unit Tests:**
- Edge cases: empty strings, very long paths, unicode symbols
- Error cases: null inputs, missing components

#### Language Detection Tests

**Property Tests:**
- Property 1: Language detection accuracy

**Unit Tests:**
- Edge cases: empty directories, deeply nested files
- Mixed cases: Go and TypeScript in same directory

#### SCIP Parser Tests

**Property Tests:**
- Property 10: SCIP parsing completeness
- Property 11: Incremental parsing efficiency
- Property 12: Malformed SCIP handling

**Unit Tests:**
- Edge cases: empty index, single symbol, large index
- Error cases: corrupted files, missing fields

#### Documentation Generator Tests

**Property Tests:**
- Property 13: Documentation co-location
- Property 14: Documentation content completeness
- Property 15: Manual section preservation
- Property 16: Documentation change detection

**Unit Tests:**
- Edge cases: no symbols, many symbols, nested directories
- Template variations: function, class, module

#### MCP Tool Integration Tests

**Property Tests:**
- Property 2: Correct SCIP tool invocation
- Property 3: Multi-language package handling
- Property 4: Index output location consistency
- Property 5: Index hash determinism
- Property 17: ARN resolution correctness
- Property 18: Workspace package discovery
- Property 19: Dependency order processing
- Property 20: Force parameter behavior

**Unit Tests:**
- Tool response structure validation
- Error response format validation
- Timeout handling

### Test Data Generation

For property-based tests, generate:
- Random valid ARN components (type, workspace, package, path, symbol)
- Random directory structures with Go/TypeScript files
- Random SCIP index content (symbols, relationships)
- Random documentation with manual sections

### Test File Organization

```
tests/
├── unit/
│   ├── lib/
│   │   ├── arn.test.ts
│   │   ├── scip_parser.test.ts
│   │   ├── doc_generator.test.ts
│   │   └── language_detector.test.ts
│   └── tools/
│       ├── scip_indexing.test.ts
│       ├── doc_generation.test.ts
│       ├── arn_resolution.test.ts
│       ├── workspace_indexing.test.ts
│       └── workspace_docs.test.ts
├── property/
│   ├── arn.property.test.ts
│   ├── scip_parser.property.test.ts
│   ├── doc_generator.property.test.ts
│   └── workspace.property.test.ts
└── fixtures/
    ├── scip/                    # Sample SCIP index files
    ├── packages/                # Sample package structures
    └── docs/                    # Sample documentation files
```

## Architectural Context

This design implements Phase 1 (Code Intelligence Foundation) of the Archon Agent Pipeline. For complete system context including:

- System context diagrams showing workspace and Kiro CLI integration
- Phase definitions and roadmap (Phase 2: Knowledge Base, Phase 3: Agent Orchestration)
- Kiro hook configuration for automated workflows
- Integration with future GraphQL Code Graph and Vector Store

Refer to the root specification at `.kiro/specs/archon-agent-pipeline/design.md`.

**Source**
- `.kiro/specs/archon-agent-pipeline/design.md` - Root specification design
- `.kiro/specs/archon-agent-pipeline/requirements.md` - Root specification requirements
- `AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/requirements.md` - Child specification requirements
