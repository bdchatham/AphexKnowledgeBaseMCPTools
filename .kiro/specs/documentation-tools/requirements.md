# Requirements Document

## Introduction

This specification defines the implementation of MCP tools for SCIP indexing and Archon documentation generation within the AphexKnowledgeBaseMCPTools package. These tools enable Kiro agents to maintain precise code intelligence and generate plain English documentation with deterministic cross-references.

**This is a child spec** - it implements the code intelligence foundation defined in the root specification at `.kiro/specs/archon-agent-pipeline/`. Refer to the root spec for:
- Overall architectural context and system design
- Phase definitions and roadmap
- Integration with future Knowledge Base and Agent Orchestration phases

### Scope

This package implements:
- **MCP Tools**: Server-side tools that Kiro invokes for indexing and documentation
- **Core Libraries**: Reusable components for ARN generation, SCIP parsing, and documentation generation
- **Workspace Playbooks**: Orchestration tools for multi-package operations

### Implementation Approach

All functionality is exposed as MCP tools following the Model Context Protocol. The tools are designed for:
- **Deterministic outputs**: Same inputs always produce same ARNs and index hashes
- **Incremental processing**: Only regenerate when SCIP indexes actually change
- **Language detection**: Automatically detect Go and JavaScript/TypeScript in packages
- **Co-located documentation**: `<name>.archon.md` files live next to source code

## Glossary

- **SCIP**: Source Code Index Protocol - a standard format for code intelligence data
- **SCIP_Index**: A file containing precise code navigation data (definitions, references, symbols)
- **SCIP_Tool**: Language-specific indexer (scip-go, scip-typescript)
- **ARN**: Archon Resource Name - deterministic identifier for graph nodes (format: `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`)
- **Archon_Doc**: Documentation file co-located with source code (`<name>.archon.md`)
- **MCP_Tool**: Model Context Protocol tool that provides capabilities to LLM agents
- **MCP_Server**: The server that hosts MCP tools and handles tool invocations
- **Workspace**: A collection of related packages that form a logical unit
- **Package**: A single repository within a workspace
- **Index_Hash**: SHA-256 hash of SCIP index content used for change detection
- **Manual_Section**: User-edited content in Archon docs preserved across regenerations (marked with `<!-- archon:manual -->`)

## Requirements

### Requirement 1: SCIP Indexing MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool to generate SCIP indexes for packages, so that precise code intelligence is available for documentation generation.

#### Acceptance Criteria

1.1 THE MCP tool SHALL be registered with the MCP server as `generate_scip_index`

1.2 THE tool SHALL accept a `packagePath` parameter specifying the package to index

1.3 THE tool SHALL detect if the package contains Go code (presence of `go.mod` or `.go` files)

1.4 THE tool SHALL detect if the package contains JavaScript/TypeScript code (presence of `package.json` or `.js`/`.ts` files)

1.5 THE tool SHALL invoke scip-go for Go packages

1.6 THE tool SHALL invoke scip-typescript for JavaScript/TypeScript packages

1.7 WHEN a package contains both Go and JavaScript/TypeScript THEN the tool SHALL generate indexes for both languages

1.8 THE tool SHALL output SCIP index files to `<package>/.archon/scip/` with consistent naming:
  - `index.scip` for single-language packages
  - `index.go.scip` and `index.ts.scip` for multi-language packages

1.9 THE tool SHALL compute and store a SHA-256 hash of each SCIP index for change detection

1.10 IF the required SCIP tool is not installed THEN the tool SHALL return an error with installation instructions

1.11 THE tool SHALL return a response containing:
  - `success`: boolean indicating overall success
  - `packagePath`: the indexed package path
  - `languagesDetected`: array of detected languages ('go' | 'typescript')
  - `indexes`: array of index results with language, indexPath, symbolCount, and hash
  - `errors`: array of error messages (if any)

### Requirement 2: ARN Generation Library

**User Story:** As a system component, I want to generate deterministic ARNs for code symbols, so that cross-references are stable and consistent.

#### Acceptance Criteria

2.1 THE ARN library SHALL be implemented as a TypeScript module in `src/lib/arn.ts`

2.2 THE ARN format SHALL be `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`

2.3 THE `<type>` component SHALL support the following values: `code`, `doc`, `k8s`, `infra`

2.4 THE library SHALL generate identical ARNs for identical code locations across runs (determinism)

2.5 THE library SHALL provide a `parse` function that extracts components from an ARN string

2.6 THE library SHALL provide a `validate` function that returns errors for malformed ARNs including:
  - Missing required components
  - Invalid type values
  - Malformed format

2.7 THE library SHALL normalize paths by:
  - Removing leading `./`
  - Resolving `..` segments
  - Normalizing path separators

2.8 THE library SHALL handle symbols with special characters by escaping:
  - `/` → `%2F`
  - `#` → `%23`
  - `%` → `%25`

### Requirement 3: SCIP Index Parser

**User Story:** As a documentation generator, I want to parse SCIP indexes to extract symbol information, so that I can generate accurate documentation.

#### Acceptance Criteria

3.1 THE parser SHALL be implemented as a TypeScript module in `src/lib/scip_parser.ts`

3.2 THE parser SHALL read SCIP index files and extract:
  - Symbol names
  - Symbol kinds (function, class, method, variable, type, module)
  - Symbol signatures
  - Symbol documentation (if present)
  - Symbol locations (file, line, column)

3.3 THE parser SHALL map SCIP symbols to ARNs using the ARN library

3.4 THE parser SHALL build a symbol table containing: name, kind, signature, documentation, location, and ARN

3.5 THE parser SHALL extract relationships between symbols:
  - `contains`: parent-child relationships
  - `references`: symbol usage relationships
  - `implements`: interface implementation relationships
  - `extends`: inheritance relationships
  - `imports`: module import relationships

3.6 THE parser SHALL support incremental parsing by:
  - Tracking which files have changed since last parse
  - Only processing changed files
  - Preserving previously parsed data for unchanged files

3.7 THE parser SHALL handle malformed SCIP indexes gracefully by:
  - Returning a structured error with diagnostic information
  - Not crashing or producing invalid output
  - Continuing to parse valid portions where possible

### Requirement 4: Archon Documentation Generator MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool to generate plain English documentation summaries from SCIP indexes, so that docs stay synchronized with code.

#### Acceptance Criteria

4.1 THE MCP tool SHALL be registered with the MCP server as `generate_archon_doc`

4.2 THE tool SHALL create documentation files following the naming convention `<name>.archon.md` co-located with source files:
  - For `src/lib/arn.ts` → `src/lib/arn.archon.md`

4.3 THE tool SHALL use SCIP symbol information to generate plain English summaries including:
  - Purpose description
  - Public API documentation
  - Parameter descriptions
  - Return value descriptions

4.4 THE tool SHALL include ARN references to related symbols in the documentation using the format:
  - `[SymbolName](arn:archon:code:workspace/package/path#symbol)`

4.5 THE tool SHALL preserve manually-edited sections marked with `<!-- archon:manual -->` and `<!-- /archon:manual -->` during regeneration

4.6 THE tool SHALL only regenerate documentation when the corresponding SCIP index hash has changed since last generation

4.7 THE tool SHALL support templates for different symbol kinds:
  - Function template
  - Class template
  - Method template
  - Module template

4.8 THE tool SHALL return a response containing:
  - `success`: boolean indicating overall success
  - `packagePath`: the documented package path
  - `filesGenerated`: array of generated files with sourcePath, docPath, and ARN
  - `filesSkipped`: array of unchanged files that were skipped
  - `errors`: array of error messages (if any)

4.9 WHEN a source file is deleted THEN the tool SHALL mark the corresponding Archon_Doc as orphaned by adding an `<!-- archon:orphaned -->` marker

### Requirement 5: ARN Resolution MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool to resolve ARNs to file locations, so that I can navigate to referenced code and documentation.

#### Acceptance Criteria

5.1 THE MCP tool SHALL be registered with the MCP server as `resolve_arn`

5.2 THE tool SHALL accept an `arn` parameter containing the ARN to resolve

5.3 THE tool SHALL return for successfully resolved ARNs:
  - `type`: the ARN type (code, doc, k8s, infra)
  - `workspace`: the workspace identifier
  - `package`: the package name
  - `path`: the file path relative to package
  - `symbol`: the symbol name (if present)
  - `filePath`: the absolute file path
  - `lineNumber`: the line number (if available)

5.4 THE tool SHALL return an error with a descriptive message if the ARN cannot be resolved due to:
  - Invalid ARN format
  - Non-existent file
  - Non-existent symbol

5.5 THE tool SHALL support resolving both `code` and `doc` ARN types:
  - `code` ARNs resolve to source files
  - `doc` ARNs resolve to `.archon.md` files

### Requirement 6: Workspace Indexing Playbook MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool that orchestrates SCIP indexing across all packages in a workspace, so that I can maintain the complete knowledge base.

#### Acceptance Criteria

6.1 THE MCP tool SHALL be registered with the MCP server as `index_workspace`

6.2 THE tool SHALL accept a `workspacePath` parameter specifying the workspace root

6.3 THE tool SHALL discover all packages in the workspace by detecting:
  - Directories containing `go.mod` (Go packages)
  - Directories containing `package.json` (TypeScript/JavaScript packages)

6.4 THE tool SHALL invoke SCIP indexing for each package in dependency order (dependencies before dependents)

6.5 THE tool SHALL track which packages have changed since last indexing using stored index hashes

6.6 THE tool SHALL return a response containing:
  - `success`: boolean indicating overall success
  - `workspacePath`: the indexed workspace path
  - `packagesIndexed`: array of indexed packages with package name, languages, and symbolCount
  - `packagesSkipped`: array of unchanged packages that were skipped
  - `totalSymbols`: total count of symbols indexed
  - `errors`: array of errors by package

6.7 THE tool SHALL support a `force` parameter that when true causes all packages to be re-indexed regardless of change status

6.8 THE tool SHALL support a `packages` parameter to limit indexing to specific packages

### Requirement 7: Workspace Documentation Playbook MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool that orchestrates documentation generation across all packages in a workspace, so that I can maintain comprehensive documentation.

#### Acceptance Criteria

7.1 THE MCP tool SHALL be registered with the MCP server as `document_workspace`

7.2 THE tool SHALL accept a `workspacePath` parameter specifying the workspace root

7.3 THE tool SHALL only generate documentation for packages with changed SCIP indexes (detected via hash comparison)

7.4 THE tool SHALL generate plain English summaries with ARN references for all documented symbols

7.5 THE tool SHALL return a response containing:
  - `success`: boolean indicating overall success
  - `workspacePath`: the documented workspace path
  - `packagesDocumented`: array of documented packages with package name, filesGenerated count, and arnsCreated array
  - `packagesSkipped`: array of unchanged packages that were skipped
  - `totalFilesGenerated`: total count of documentation files generated
  - `totalArns`: total count of ARNs created
  - `errors`: array of errors by package

7.6 THE tool SHALL support a `packages` parameter to limit documentation to specific packages

7.7 THE tool SHALL support a `force` parameter that when true causes all packages to be re-documented regardless of change status

### Requirement 8: Sync to Knowledge Base MCP Tool

**User Story:** As a Kiro agent, I want an MCP tool to synchronize code intelligence to the knowledge base, so that the Code Graph and Vector Store reflect the current state of the codebase.

#### Acceptance Criteria

8.1 THE MCP tool SHALL be registered with the MCP server as `sync_to_knowledge_base`

8.2 THE tool SHALL accept a `workspacePath` parameter specifying the workspace root to sync

8.3 THE tool SHALL accept an optional `packages` parameter to limit synchronization to specific packages

8.4 THE tool SHALL accept an optional `force` parameter that when true bypasses change detection and performs a full sync

8.5 THE tool SHALL call the sync service API in ArchonKnowledgeBaseInfrastructure to trigger synchronization

8.6 THE tool SHALL support both full sync mode (all packages) and incremental sync mode (only changed packages)

8.7 THE tool SHALL return a response containing:
  - `success`: boolean indicating overall success
  - `packagesSynced`: array of synced packages with package name, nodesCreated, nodesUpdated, and chunksUpserted counts
  - `packagesSkipped`: array of package names that were skipped due to no changes
  - `errors`: array of error objects with package name and error message

8.8 WHEN the sync service API is unavailable THEN the tool SHALL return an error with a descriptive message and retry guidance

8.9 THE tool SHALL report sync status including what was synced to the Code Graph (nodes, edges) and Vector Store (chunks)

## Architectural Context

This specification implements Phase 1 (Code Intelligence Foundation) of the Archon Agent Pipeline. For complete architectural context including:

- System context diagrams
- Data flow diagrams
- Component interfaces
- Data models (ARN format, SCIP storage, documentation format)
- Correctness properties
- Testing strategy

Refer to the root specification at `.kiro/specs/archon-agent-pipeline/design.md`.

**Source**
- `.kiro/specs/archon-agent-pipeline/requirements.md` - Root specification requirements
- `.kiro/specs/archon-agent-pipeline/design.md` - Root specification design
