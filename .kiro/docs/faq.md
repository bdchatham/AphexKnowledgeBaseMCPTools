# Archon Documentation MCP Tools FAQ

## SCIP Indexing Questions

### What is SCIP and why is it used?

SCIP (Source Code Index Protocol) is a standard format for code intelligence data developed by Sourcegraph. It provides precise information about symbol definitions, references, and relationships.

**Why SCIP:**
- Language-agnostic format for code intelligence
- Precise navigation (not text-based search)
- Supports cross-file and cross-package references
- Well-maintained tools for Go and TypeScript

**Source**
- [SCIP Protocol Documentation](https://github.com/sourcegraph/scip)

### Which languages are supported?

Currently supported:
- **Go**: Via `scip-go` indexer
- **TypeScript/JavaScript**: Via `scip-typescript` indexer

Future support planned:
- **Python**: Via `scip-python` (Phase 2)

### How do I install the SCIP tools?

**For Go:**
```bash
go install github.com/sourcegraph/scip-go@latest
```

**For TypeScript:**
```bash
npm install -g @sourcegraph/scip-typescript
```

### Why is my SCIP index empty?

Common causes:
1. **No source files**: Package has no `.go` or `.ts` files
2. **Compilation errors**: Source files have syntax errors
3. **Missing dependencies**: Run `go mod download` or `npm install`
4. **Wrong directory**: SCIP tool run from wrong location

**Diagnosis:**
```bash
# Run SCIP tool directly to see errors
cd /path/to/package
scip-go  # or scip-typescript
```

## ARN Format Questions

### What is an ARN?

ARN (Archon Resource Name) is a deterministic identifier for resources in the Archon system. It enables stable cross-references between code, documentation, and infrastructure.

**Format:**
```
arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
```

### What ARN types are supported?

| Type | Description | Example |
|------|-------------|---------|
| `code` | Source code symbols | Functions, classes, methods |
| `doc` | Documentation files | `.archon.md` files |
| `k8s` | Kubernetes resources | Deployments, services |
| `infra` | Infrastructure definitions | CDK stacks, Terraform |

### How are special characters handled in ARNs?

Special characters in symbol names are URL-encoded:

| Character | Encoded |
|-----------|---------|
| `/` | `%2F` |
| `#` | `%23` |
| `%` | `%25` |

**Example:**
```
Symbol: Class/Method
ARN: arn:archon:code:ws/pkg/file.ts#Class%2FMethod
```

### Why does ARN resolution fail?

Common causes:
1. **Malformed ARN**: Check format matches `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
2. **File not found**: Referenced file doesn't exist
3. **Symbol not indexed**: SCIP index hasn't been generated
4. **Typo in symbol name**: Symbol name doesn't match source

**Resolution:**
1. Validate ARN format using `validate()` function
2. Verify file exists at the specified path
3. Run `generate_scip_index` for the package
4. Check symbol name matches source code exactly

## Documentation Generation Questions

### Where are generated docs stored?

Documentation files are co-located with source files:

| Source | Documentation |
|--------|---------------|
| `src/lib/arn.ts` | `src/lib/arn.archon.md` |
| `cmd/root.go` | `cmd/root.archon.md` |

### How do I preserve manual edits?

Wrap manual content in special markers:

```markdown
<!-- archon:manual -->
## My Custom Notes

This content will be preserved when documentation is regenerated.

<!-- /archon:manual -->
```

### Why isn't my documentation updating?

The documentation generator uses hash-based change detection. Documentation only regenerates when the SCIP index hash changes.

**Force regeneration:**
```json
{
  "packagePath": "/path/to/package",
  "force": true
}
```

### What content is generated?

Generated documentation includes:
- Symbol name and type
- Plain English description (from doc comments)
- Public API documentation
- ARN references to related symbols
- Source file location

## Workspace Operations Questions

### How are packages discovered?

Packages are identified by language markers:

| Language | Markers |
|----------|---------|
| Go | `go.mod` or `.go` files |
| TypeScript | `package.json` or `.ts`/`.js` files |

### What is dependency order processing?

For workspaces with inter-package dependencies, packages are processed in dependency order (dependencies before dependents). This ensures ARN references are valid when documentation is generated.

### How do I index only specific packages?

Use the `packages` parameter:

```json
{
  "workspacePath": "/workspace",
  "packages": ["PackageA", "PackageB"]
}
```

### How do I force re-indexing everything?

Use the `force` parameter:

```json
{
  "workspacePath": "/workspace",
  "force": true
}
```

## Troubleshooting Questions

### How do I debug tool failures?

1. **Check logs**: Set `LOG_LEVEL=debug` for detailed output
2. **Run SCIP directly**: Execute `scip-go` or `scip-typescript` manually
3. **Verify paths**: Ensure package paths are correct and accessible
4. **Check dependencies**: Run `go mod download` or `npm install`

### What if a SCIP tool is not installed?

The tool returns a helpful error message:

```json
{
  "success": false,
  "error": "scip-go not installed. Install with: go install github.com/sourcegraph/scip-go@latest"
}
```

### How do I clean up generated artifacts?

```bash
# Remove SCIP indexes
find . -path '*/.archon/scip' -type d -exec rm -rf {} +

# Remove generated documentation
find . -name '*.archon.md' -type f -delete
```

### Why are some symbols missing from the index?

Common causes:
1. **Private symbols**: Some SCIP tools only index exported symbols
2. **Generated code**: Auto-generated files may be excluded
3. **Build errors**: Files with errors may be skipped
4. **Ignored patterns**: Check for `.gitignore` or tool-specific ignore files

## Integration Questions

### How does this integrate with Kiro?

Kiro agents invoke MCP tools through the Model Context Protocol. A Kiro hook automates the documentation workflow:

1. `index_workspace` - Generate SCIP indexes
2. `document_workspace` - Generate documentation

### What is the Kiro hook?

The Kiro hook (`archon-documentation-workflow.kiro.hook`) defines an automated workflow that triggers on:
- Manual invocation
- Post-merge to main branch

### How will this integrate with the Knowledge Base?

Future integration (Phase 2) will:
- Store symbols in a GraphQL Code Graph
- Store embeddings in a Vector Store with ARN metadata
- Enable semantic search across code and documentation

**Source**
- `.kiro/specs/archon-agent-pipeline/requirements.md` - Phase 2 requirements

