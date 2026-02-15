# Archon Documentation MCP Tools Operations

## Building the MCP Server

The MCP server is built using TypeScript and requires Node.js 18+ for execution.

### Prerequisites

- Node.js 18 or later
- npm or yarn package manager
- Go (for `scip-go` tool)
- TypeScript globally installed (optional, for development)

### Build Steps

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npm run build

# Verify build output
ls dist/
```

**Build Output:**
- `dist/server.js` - Compiled MCP server entry point
- `dist/tools/` - Compiled tool implementations
- `dist/lib/` - Compiled core libraries
- `dist/types/` - Compiled type definitions

**Source**
- `package.json` - Build scripts and dependencies
- `tsconfig.json` - TypeScript compiler configuration

## Running the MCP Server

The MCP server runs as a standalone process that communicates via the Model Context Protocol.

### Development Mode

```bash
# Run with ts-node for development
npm run dev

# Or run compiled version
npm start
```

### Production Mode

```bash
# Build first
npm run build

# Run compiled server
node dist/server.js
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKSPACE_PATH` | No | Current directory | Default workspace root for operations |
| `LOG_LEVEL` | No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

**Source**
- `src/server.ts` - Server entry point with environment handling

## Installing SCIP Tools

The MCP server requires language-specific SCIP tools to generate indexes.

### scip-go (Go Indexer)

```bash
# Install scip-go
go install github.com/sourcegraph/scip-go@latest

# Verify installation
scip-go --version
```

**Requirements:**
- Go 1.18 or later
- `$GOPATH/bin` in `$PATH`

### scip-typescript (TypeScript/JavaScript Indexer)

```bash
# Install scip-typescript globally
npm install -g @sourcegraph/scip-typescript

# Verify installation
scip-typescript --version
```

**Requirements:**
- Node.js 16 or later
- npm or yarn

### Verifying Tool Installation

The `generate_scip_index` tool checks for installed SCIP tools and returns helpful error messages if tools are missing:

```json
{
  "success": false,
  "error": "scip-go not installed. Install with: go install github.com/sourcegraph/scip-go@latest"
}
```

**Source**
- `src/tools/scip_indexing.ts` - Tool installation verification logic

## Monitoring and Logging

The MCP server provides structured logging for monitoring operations.

### Log Output Format

```
[timestamp] [level] [component] message
[2024-01-15T10:30:00Z] [INFO] [scip_indexing] Indexing package: AphexKnowledgeBaseMCPTools
[2024-01-15T10:30:05Z] [INFO] [scip_indexing] Generated index: 142 symbols, hash: a1b2c3...
```

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `debug` | Detailed execution traces | Development troubleshooting |
| `info` | Normal operation events | Production monitoring |
| `warn` | Recoverable issues | Alerting on degraded state |
| `error` | Fatal failures | Incident response |

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Index generation time | Time to generate SCIP index | > 60 seconds |
| Symbol count | Symbols extracted per package | Sudden drop > 50% |
| Error rate | Failed tool invocations | > 5% of requests |

**Source**
- `src/server.ts` - Logging configuration

## Troubleshooting Common Issues

### SCIP Tool Not Found

**Symptom:** Tool returns error about missing SCIP tool.

**Diagnosis:**
```bash
# Check if scip-go is installed
which scip-go

# Check if scip-typescript is installed
which scip-typescript
```

**Resolution:**
1. Install the missing tool (see Installing SCIP Tools section)
2. Ensure tool binary is in `$PATH`
3. Restart the MCP server

### Index Generation Fails

**Symptom:** `generate_scip_index` returns errors for a package.

**Diagnosis:**
```bash
# Try running SCIP tool directly
cd /path/to/package
scip-go  # For Go packages
scip-typescript  # For TypeScript packages
```

**Common Causes:**
- Invalid `go.mod` or `package.json`
- Missing dependencies (run `go mod download` or `npm install`)
- Syntax errors in source files

**Resolution:**
1. Fix any compilation errors in the package
2. Ensure dependencies are installed
3. Re-run the indexing tool

### ARN Resolution Fails

**Symptom:** `resolve_arn` returns "not found" for valid-looking ARN.

**Diagnosis:**
1. Verify ARN format: `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
2. Check that the referenced file exists
3. Verify SCIP index has been generated for the package

**Resolution:**
1. Run `generate_scip_index` for the package
2. Verify the symbol exists in the source file
3. Check for typos in the ARN

### Documentation Not Regenerating

**Symptom:** `generate_archon_doc` skips files that should be updated.

**Diagnosis:**
- Check if SCIP index hash has changed
- Verify `force` parameter is set if needed

**Resolution:**
1. Run `generate_scip_index` to update the index
2. Use `force: true` to regenerate regardless of hash
3. Check `.archon/scip/metadata.json` for stored hashes

**Source**
- `src/tools/` - Tool implementations with error handling

## Workspace Configuration

### SCIP Index Storage Location

SCIP indexes are stored in a standardized location within each package:

```
<package>/
├── .archon/
│   └── scip/
│       ├── index.scip           # Single-language index
│       ├── index.go.scip        # Go-specific index (multi-language)
│       ├── index.ts.scip        # TypeScript-specific index (multi-language)
│       └── metadata.json        # Index metadata and hashes
```

### Archon Documentation Location

Generated documentation files are co-located with source files:

```
src/
├── lib/
│   ├── arn.ts
│   ├── arn.archon.md           # Generated documentation
│   ├── scip_parser.ts
│   └── scip_parser.archon.md   # Generated documentation
```

### Cleaning Generated Artifacts

```bash
# Remove all SCIP indexes
find . -path '*/.archon/scip' -type d -exec rm -rf {} +

# Remove all generated documentation
find . -name '*.archon.md' -type f -delete
```

**Source**
- `.kiro/specs/archon-agent-pipeline/design.md` - Storage location specifications

