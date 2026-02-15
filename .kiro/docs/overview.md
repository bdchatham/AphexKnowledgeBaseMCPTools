# Archon Documentation MCP Tools Overview

## Purpose

AphexKnowledgeBaseMCPTools is a TypeScript MCP (Model Context Protocol) server that provides code intelligence and documentation generation capabilities to Kiro agents. It serves as the foundation for the Archon RAG system's code understanding layer.

**Key Problem Solved:**
- Enables automated, precise code navigation and documentation generation
- Provides deterministic cross-references between code, documentation, and infrastructure
- Supports incremental processing to avoid redundant work

## Key Capabilities

### SCIP Indexing

Generates Source Code Index Protocol (SCIP) indexes for Go and TypeScript packages. SCIP indexes provide precise code navigation data including symbol definitions, references, and relationships.

### Documentation Generation

Produces plain English documentation summaries (`<name>.archon.md` files) co-located with source code. Documentation includes ARN references for cross-linking and preserves manually-edited sections.

### ARN Resolution

Resolves Archon Resource Names (ARNs) to file locations and symbol information, enabling navigation between code and documentation across the workspace.

### Workspace Orchestration

Coordinates indexing and documentation generation across all packages in a workspace, with support for incremental processing and dependency ordering.

## System Context

This package is part of the Archon Agent Pipeline, which enables end-to-end autonomous development workflows:

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
│  │ generate_scip_  │  │ generate_archon │  │ resolve_arn     │     │
│  │ index           │  │ _doc            │  │                 │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│  ┌─────────────────┐  ┌─────────────────┐                          │
│  │ index_workspace │  │ document_       │                          │
│  │                 │  │ workspace       │                          │
│  └─────────────────┘  └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Kiro CLI                                     │
│  Invokes MCP tools to maintain code intelligence and documentation  │
└─────────────────────────────────────────────────────────────────────┘
```

## MCP Tools Summary

| Tool | Purpose |
|------|---------|
| `generate_scip_index` | Generate SCIP indexes for a single package |
| `generate_archon_doc` | Generate documentation from SCIP indexes |
| `resolve_arn` | Resolve ARN to file location and symbol info |
| `index_workspace` | Orchestrate indexing across all workspace packages |
| `document_workspace` | Orchestrate documentation across all workspace packages |

## Glossary

### SCIP (Source Code Index Protocol)
A standard format for code intelligence data. SCIP indexes contain precise information about symbol definitions, references, and relationships. Language-specific tools (`scip-go`, `scip-typescript`) generate these indexes.

### ARN (Archon Resource Name)
A deterministic identifier for resources in the Archon system. Format: `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`. Types include `code`, `doc`, `k8s`, and `infra`.

### Archon_Doc
Documentation files co-located with source code, following the naming convention `<name>.archon.md`. These files contain plain English summaries with ARN references to related symbols.

### MCP (Model Context Protocol)
A protocol for exposing tools and capabilities to LLM agents. This package implements an MCP server that Kiro agents invoke for code intelligence operations.

### Workspace
A collection of related packages that form a logical unit. The workspace-level tools orchestrate operations across all packages.

### Package
A single repository or module within a workspace. Each package may contain Go, TypeScript, or both languages.

**Source**
- `src/server.ts` - MCP server entry point
- `src/tools/` - MCP tool implementations
- `src/lib/` - Core libraries (ARN, SCIP parser, doc generator)
- `.kiro/specs/archon-agent-pipeline/requirements.md` - Root specification
