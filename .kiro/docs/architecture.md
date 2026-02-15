<<<<<<< HEAD
# Archon Documentation MCP Tools Architecture

## System Overview

AphexKnowledgeBaseMCPTools is a TypeScript MCP server that provides code intelligence capabilities to Kiro agents. The architecture follows an MCP-first design where all functionality is exposed as tools that agents can invoke.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Workspace                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Package1 │  │ Package2 │  │ Package3 │  │ Package4 │  ...       │
│  │  (Go)    │  │  (TS)    │  │ (Go+TS)  │  │  (Go)    │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  AphexKnowledgeBaseMCPTools                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ SCIP Indexing   │  │ Doc Generation  │  │ ARN Resolution  │     │
│  │ Tool            │  │ Tool            │  │ Tool            │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │               │
│  ┌────────▼────────────────────▼────────────────────▼────────┐     │
│  │                    Core Libraries                          │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │     │
│  │  │ ARN Library  │  │ SCIP Parser  │  │ Doc Generator│     │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Workspace Playbooks                         │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐           │   │
│  │  │ Indexing Playbook   │  │ Documentation       │           │   │
│  │  │ Tool                │  │ Playbook Tool       │           │   │
│  │  └─────────────────────┘  └─────────────────────┘           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Kiro CLI                                     │
│  Invokes MCP tools to maintain code intelligence and documentation  │
└─────────────────────────────────────────────────────────────────────┘
```

**Source**
- `src/server.ts` - MCP server entry point
- `.kiro/specs/archon-agent-pipeline/design.md` - Root specification design

## Package Structure

The package follows a layered architecture separating MCP tools, core libraries, and type definitions:

```
AphexKnowledgeBaseMCPTools/
├── src/
│   ├── server.ts                 # MCP server entry point
│   ├── tools/                    # MCP tool implementations
│   │   ├── scip_indexing.ts      # SCIP indexing tool
│   │   ├── doc_generation.ts     # Documentation generation tool
│   │   ├── arn_resolution.ts     # ARN resolution tool
│   │   ├── workspace_indexing.ts # Workspace indexing playbook
│   │   └── workspace_docs.ts     # Workspace documentation playbook
│   ├── lib/                      # Core libraries
│   │   ├── arn.ts                # ARN generation and parsing
│   │   ├── scip_parser.ts        # SCIP index parser
│   │   ├── doc_generator.ts      # Documentation generator
│   │   └── language_detector.ts  # Go/TypeScript detection
│   └── types/                    # Type definitions
│       ├── arn.ts                # ARN type definitions
│       ├── scip.ts               # SCIP-related types
│       └── tools.ts              # Tool input/output types
├── package.json
└── tsconfig.json
```

**Source**
- `src/` - Source directory structure

## MCP Server Entry Point

The MCP server (`server.ts`) registers all tools and handles the Model Context Protocol communication. It exposes five tools to Kiro agents:

| Tool | Purpose |
|------|---------|
| `generate_scip_index` | Generate SCIP indexes for a single package |
| `generate_archon_doc` | Generate documentation from SCIP indexes |
| `resolve_arn` | Resolve ARN to file location and symbol info |
| `index_workspace` | Orchestrate indexing across all workspace packages |
| `document_workspace` | Orchestrate documentation across all workspace packages |

**Source**
- `src/server.ts` - MCP server implementation

## Data Flow: Source Code to Documentation

The system processes source code through a pipeline that produces indexed documentation with cross-references:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Package   │────▶│   SCIP      │────▶│   SCIP      │────▶│   Archon    │
│   Source    │     │   Tool      │     │   Index     │     │   Doc       │
│   Code      │     │ (go/ts)     │     │   File      │     │   (.md)     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │   Index     │
                                        │   Hash      │
                                        │   Store     │
                                        └─────────────┘
```

**Processing Steps:**
1. **Language Detection**: Identify Go (`go.mod`, `.go`) and TypeScript (`package.json`, `.ts/.js`) in package
2. **SCIP Indexing**: Invoke `scip-go` or `scip-typescript` to generate index files
3. **Index Parsing**: Extract symbols, definitions, references, and relationships
4. **ARN Generation**: Create deterministic identifiers for each symbol
5. **Documentation Generation**: Produce `<name>.archon.md` files with ARN references
6. **Hash Storage**: Track index hashes for incremental processing

**Source**
- `src/tools/scip_indexing.ts` - SCIP indexing implementation
- `src/tools/doc_generation.ts` - Documentation generation implementation
- `src/lib/language_detector.ts` - Language detection logic

## Core Library: ARN (Archon Resource Name)

The ARN library provides deterministic identifier generation for code symbols. ARNs enable stable cross-references between code, documentation, and infrastructure.

**ARN Format:**
```
arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
```

**Components:**
| Component | Description | Example |
|-----------|-------------|---------|
| `type` | Resource type | `code`, `doc`, `k8s`, `infra` |
| `workspace` | Workspace identifier | `personal-work` |
| `package` | Package/repository name | `AphexKnowledgeBaseMCPTools` |
| `path` | File path relative to package | `src/lib/arn.ts` |
| `symbol` | Symbol name (optional) | `ARNLibrary.generate` |

**Key Operations:**
- `generate()`: Create ARN from components
- `parse()`: Extract components from ARN string
- `validate()`: Check ARN format correctness
- `normalizePath()`: Canonicalize path segments
- `escapeSymbol()` / `unescapeSymbol()`: Handle special characters

**Source**
- `src/lib/arn.ts` - ARN library implementation
- `src/types/arn.ts` - ARN type definitions

## Core Library: SCIP Parser

The SCIP Parser reads Source Code Index Protocol files and extracts structured symbol information. It maps SCIP symbols to ARNs for cross-referencing.

**Extracted Data:**
- **Symbols**: Name, kind (function/class/method/variable/type/module), signature, documentation, location
- **Relationships**: Contains, references, implements, extends, imports

**Key Operations:**
- `parse()`: Read SCIP index and extract symbols with ARNs
- `hasChanged()`: Compare index hash for incremental processing

**Source**
- `src/lib/scip_parser.ts` - SCIP parser implementation
- `src/types/scip.ts` - SCIP type definitions

## Core Library: Language Detector

The Language Detector identifies programming languages present in a package by examining file markers.

**Detection Rules:**
- **Go**: Presence of `go.mod` or `.go` files
- **TypeScript/JavaScript**: Presence of `package.json` or `.ts`/`.js` files

**Output:**
- `hasGo`: Boolean indicating Go presence
- `hasTypeScript`: Boolean indicating TypeScript/JavaScript presence
- `goRoot`: Path to Go module root
- `tsRoot`: Path to TypeScript/JavaScript root

**Source**
- `src/lib/language_detector.ts` - Language detection implementation

## Core Library: Documentation Generator

The Documentation Generator produces plain English summaries from SCIP symbol information. Generated documentation is co-located with source files.

**Key Features:**
- **Co-location**: `<name>.archon.md` files next to source files
- **ARN References**: Links to related symbols via ARNs
- **Manual Section Preservation**: Content within `<!-- archon:manual -->` markers is preserved across regenerations
- **Change Detection**: Only regenerates when SCIP index hash changes

**Document Structure:**
```markdown
# <Symbol Name>

<!-- archon:generated -->
<!-- arn: arn:archon:doc:workspace/package/path -->
<!-- source: arn:archon:code:workspace/package/path#symbol -->
<!-- index-hash: abc123... -->

## Purpose
<Plain English description>

## Public API
<Function/method documentation>

<!-- archon:manual -->
## Notes
<User-added content preserved across regenerations>
<!-- /archon:manual -->
```

**Source**
- `src/lib/doc_generator.ts` - Documentation generator implementation

## Workspace Playbook Tools

Workspace playbooks orchestrate operations across all packages in a workspace, enabling batch processing with incremental updates.

### Workspace Indexing Playbook

Coordinates SCIP indexing across all packages:
- Discovers packages in workspace
- Processes packages in dependency order
- Tracks which packages have changed since last indexing
- Supports `force` parameter to re-index all packages

### Workspace Documentation Playbook

Coordinates documentation generation across all packages:
- Only generates docs for packages with changed SCIP indexes
- Supports `packages` parameter to limit scope
- Reports generated files and ARNs per package

**Source**
- `src/tools/workspace_indexing.ts` - Workspace indexing playbook
- `src/tools/workspace_docs.ts` - Workspace documentation playbook

## Design Principles

The architecture follows these core principles:

1. **MCP-First**: All functionality exposed as MCP tools for agent invocation
2. **Deterministic Outputs**: Same inputs always produce same ARNs and index hashes
3. **Incremental Processing**: Only regenerate when SCIP indexes actually change
4. **Language Detection**: Automatically detect Go and TypeScript in packages
5. **Co-located Documentation**: `<name>.archon.md` files live next to source code

**Source**
- `.kiro/specs/archon-agent-pipeline/design.md` - Design principles documentation

## Integration Patterns

This section documents how the MCP server integrates with external systems and tools.

### Kiro CLI Integration

The primary consumer of this MCP server is the Kiro CLI, which invokes tools for code intelligence and documentation workflows.

**MCP Tool Invocation:**

| Tool | Kiro Use Case |
|------|---------------|
| `generate_scip_index` | Index a package after code changes |
| `generate_archon_doc` | Generate documentation from indexes |
| `resolve_arn` | Navigate to code/doc locations |
| `index_workspace` | Batch index all workspace packages |
| `document_workspace` | Batch generate all documentation |

**Kiro Hook:**
The workspace defines a Kiro hook (`archon-documentation-workflow.kiro.hook`) that automates the documentation workflow on manual trigger or post-merge to main.

**Source**
- `.kiro/hooks/archon-documentation-workflow.kiro.hook` - Hook configuration

### SCIP Tool Integration

The MCP server integrates with external SCIP indexing tools:

**scip-go (Go Indexer):**
```bash
cd <package-path>
scip-go --output .archon/scip/index.go.scip
```

**scip-typescript (TypeScript Indexer):**
```bash
cd <package-path>
scip-typescript --output .archon/scip/index.ts.scip
```

**Source**
- `src/tools/scip_indexing.ts` - SCIP tool invocation

### Future Knowledge Base Integration

ARNs serve as the primary key for future cross-system integration:

```
┌─────────────────────┐
│  SCIP Index         │
│  (symbols)          │
└─────────┬───────────┘
          │ ARN
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Code Graph         │────▶│  Vector Store       │
│  (relationships)    │     │  (embeddings)       │
└─────────────────────┘     └─────────────────────┘
```

**Source**
- `.kiro/specs/archon-agent-pipeline/requirements.md` - Phase 2 requirements

### Package Dependencies

**Runtime Dependencies:**

| Dependency | Purpose |
|------------|---------|
| `@modelcontextprotocol/sdk` | MCP server implementation |
| `typescript` | TypeScript compilation |

**External Tool Dependencies:**

| Tool | Purpose |
|------|---------|
| `scip-go` | Go SCIP indexing |
| `scip-typescript` | TypeScript SCIP indexing |

**Source**
- `package.json` - Package dependencies
=======
# Architecture

## System Design

[Describe the overall system design]

## Components

[List and describe major components]

## Technology Stack

[List technologies, frameworks, and services used]

## Architectural Patterns

[Describe key architectural patterns and design decisions]

## Dependencies

### Upstream Dependencies
[Systems this repo depends on]

### Downstream Dependencies
[Systems that depend on this repo]

**Source**
[Add references to relevant code and infrastructure files]
>>>>>>> aaf307eb5fccd13f2011729bcfa32111e464d9e2
