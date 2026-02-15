---
inclusion: manual
---

# Archon Manifest-Driven Documentation

This steering document guides systematic documentation of all workspace packages using the ArchonCLI MCP server tools. It enforces deep code reading through provenance requirements and human validation checkpoints.

**This steering complements (does not replace) the existing `archon-docs.md` steering.** Use `archon-docs.md` for documentation structure and RAG-friendly formatting rules. Use this steering for the systematic, manifest-driven documentation workflow.

---

## Prerequisites

Before starting the documentation workflow:

1. **ArchonCLI MCP server is available** - Verify the server is configured in your MCP settings
2. **Workspace contains packages** - The workspace should have multiple packages to document
3. **Read CLAUDE.md** - Understand the documentation contract for each package

---

## Phase 1: Discovery and Manifest Creation

This phase discovers all packages in the workspace and creates a manifest that tracks documentation progress.

### Step 1: Discover Packages

Call `discover_packages` to get all packages in the workspace:

```
Tool: discover_packages
Input: { "workspace_root": "." }
```

This returns a list of packages with:
- `name`: Package name
- `path`: Path to package directory
- `package_type`: Go, Python, TypeScript, or Documentation
- `has_docs`: Whether `.kiro/docs` exists

### Step 2: Initialize Manifest

Call `manifest_init` to create an empty manifest:

```
Tool: manifest_init
Input: { "workspace_root": ".", "output_path": ".kiro/archon-system-manifest.yaml" }
```

### Step 3: Discover Dependencies

For each package, call `discover_dependencies` to build the dependency graph:

```
Tool: discover_dependencies
Input: { "package_path": "AphexControllerRuntime" }
```

This returns workspace-internal dependencies (packages this package depends on).

### Step 4: Compute Documentation Order

Based on dependencies, compute a topological order (leaf packages first):

1. **Leaf packages** (depth 0): Packages with no workspace dependencies
2. **Level 1 packages**: Packages that only depend on leaf packages
3. **Level 2+ packages**: Packages that depend on Level 1+ packages

Document packages in this order to ensure dependencies are documented before dependents.

### Step 5: Set Documentation Order

Call `manifest_set_order` with the computed order:

```
Tool: manifest_set_order
Input: { 
  "manifest_path": ".kiro/archon-system-manifest.yaml",
  "documentation_order": ["AphexControllerRuntime", "AphexAgentController", ...]
}
```

### Human Checkpoint: Manifest Review

**STOP AND WAIT FOR USER APPROVAL**

Present the manifest to the user:
- List all discovered packages with their types
- Show the computed documentation order
- Explain why this order was chosen (dependencies)

Ask: "Does this documentation order look correct? Should any packages be reordered or excluded?"

**Do not proceed until the user approves the manifest.**

---

## Phase 2: Per-Package Documentation (Leaf-First)

For each package in the documentation order, follow this workflow. **Complete one package fully before moving to the next.**


### Step 1: Thorough Code Reading

**THIS IS NON-NEGOTIABLE.** You must read and understand the code before documenting it.

#### 1.1 Discover Source Files

Call `discover_source_files` to see all files in the package:

```
Tool: discover_source_files
Input: { "package_path": "PackageName" }
```

This returns all source files with line counts.

#### 1.2 Read Every Source File

**Read every source file completely.** Not just headers or type definitions:

- Read function bodies to understand behavior
- Read comments for context and intent
- Understand error handling and edge cases
- Note how the package uses its dependencies
- Identify what APIs/interfaces it exposes

**Token cost is secondary to accuracy.** Documentation that doesn't match code is worse than no documentation.

#### 1.3 Build Mental Model

After reading, you should be able to answer:

- **Purpose**: What problem does this package solve?
- **Key Types**: What are the important structs/classes and their fields?
- **Key Functions**: What are the important functions and what do they do?
- **Dependencies Used**: How does it use packages it depends on?
- **APIs Exposed**: What interfaces does it provide to dependents?

#### 1.4 Verify Understanding

If anything is unclear:
- **Read more code** - Don't guess
- **Check related packages** - Dependencies may clarify behavior
- **Look at tests** - Tests often document expected behavior

**Never document behavior you don't understand. Read until you do.**

---

### Step 2: Documentation with Provenance

After understanding the code, create documentation following the 7-file structure from `archon-docs.md`.

#### 2.1 Get Documentation Template

Call `documentation_get_template` to get the skeleton structure:

```
Tool: documentation_get_template
Input: { "package_name": "PackageName", "file_name": "architecture.md" }
```

#### 2.2 Write Documentation with Provenance

For each of the 7 core documentation files, write content that:

1. **Is grounded in code you read** - Every claim must be verifiable
2. **Includes Source references** - Point to specific files for each section
3. **Uses consistent terminology** - Match terms used in the code
4. **Follows RAG-friendly structure** - 400-800 tokens per section

**Provenance Format:**

```markdown
### Component Name

Description of what this component does...

**Source**
- `path/to/implementation.go` - Main implementation
- `path/to/types.go` - Type definitions
```

#### 2.3 Submit Documentation for Validation

Call `documentation_submit` with your documentation:

```
Tool: documentation_submit
Input: {
  "package_name": "PackageName",
  "file_name": "architecture.md",
  "content": "...",
  "sources": ["path/to/file1.go", "path/to/file2.go"]
}
```

The tool validates:
- All Source references point to existing files
- Content structure is RAG-friendly

### Human Checkpoint: Documentation Review

**STOP AND WAIT FOR USER VALIDATION**

Present each documentation file to the user:
- Show the content you wrote
- Highlight the Source references
- Explain what code supports each claim

Ask: "Does this documentation accurately describe the code? Are there any inaccuracies or missing details?"

**If the user identifies issues:**
1. Read more code to understand the correct behavior
2. Revise the documentation
3. Resubmit for validation

**Do not proceed until the user approves the documentation.**

---

### Step 3: Manifest Update

After documentation is approved, update the manifest.

#### 3.1 Add Package to Manifest

Call `manifest_add_package` with the package details:

```
Tool: manifest_add_package
Input: {
  "manifest_path": ".kiro/archon-system-manifest.yaml",
  "package_name": "PackageName",
  "package_type": "Go",
  "path": "PackageName",
  "has_docs": true,
  "depends_on": ["Dependency1", "Dependency2"],
  "depth": 1
}
```

#### 3.2 Add Relationships

Call `manifest_add_relationship` for cross-package dependencies:

```
Tool: manifest_add_relationship
Input: {
  "manifest_path": ".kiro/archon-system-manifest.yaml",
  "from_package": "PackageName",
  "to_package": "DependencyName",
  "relationship_type": "uses_api",
  "description": "Uses CRD types and helpers from runtime"
}
```

#### 3.3 Proceed to Next Package

Move to the next package in the documentation order and repeat Phase 2.

---

## Phase 3: Validation

After documenting all packages, validate the complete documentation set.

### Step 1: Validate Coverage

Call `validate_coverage` to check all packages have documentation:

```
Tool: validate_coverage
Input: { "manifest_path": ".kiro/archon-system-manifest.yaml" }
```

This returns packages in the documentation order that are missing `.kiro/docs`.

**If packages are missing documentation:**
1. Return to Phase 2 for each missing package
2. Complete the full documentation workflow
3. Re-run coverage validation

### Step 2: Validate References

For each package, call `validate_references` to check cross-package references:

```
Tool: validate_references
Input: { 
  "manifest_path": ".kiro/archon-system-manifest.yaml",
  "package_path": "PackageName"
}
```

This returns invalid cross-package references in documentation.

**If invalid references are found:**
1. Review the referenced package's documentation
2. Update references to use correct terminology
3. Ensure referenced components actually exist

### Step 3: Validate Provenance

For each package, call `validate_provenance` to check Source sections:

```
Tool: validate_provenance
Input: { "package_path": "PackageName" }
```

This returns Source references that point to non-existent files.

**If invalid provenance is found:**
1. Verify the file path is correct
2. If the file was moved/renamed, update the reference
3. If the file was deleted, remove the claim or find new source

### Human Checkpoint: Final Review

**STOP AND WAIT FOR USER APPROVAL**

Present the validation summary:
- Coverage: X of Y packages documented
- References: X invalid cross-package references
- Provenance: X invalid source references

Ask: "All validation checks have passed. Would you like to review any specific package documentation before completing the workflow?"

---

## Code Reading Requirements

**These requirements are non-negotiable.** Documentation accuracy depends on thorough code reading.

### Read Source Files Completely

- **Not just headers** - Read function bodies, not just signatures
- **Not just types** - Understand how types are used, not just defined
- **Not just happy paths** - Understand error handling and edge cases

### Understand Actual Behavior

- **Don't assume** - Verify behavior by reading the code
- **Don't guess** - If uncertain, read more code
- **Don't hallucinate** - Only document what you can verify

### Provide Provenance for Every Claim

Every significant statement in documentation must have a Source reference:

```markdown
**Source**
- `controller/agent_controller.go` - Reconciliation logic
- `api/v1alpha1/agent_types.go` - Agent CRD definition
```

### Wait for Human Validation

- **User validates understanding** - Present your mental model for review
- **User validates claims** - Present documentation with source references
- **User approves before proceeding** - Don't move to next package without approval

### Revise When Asked

If the user identifies issues:
1. **Read more code** - Don't argue, investigate
2. **Understand the correction** - Ask clarifying questions if needed
3. **Revise documentation** - Update to match actual behavior
4. **Resubmit for validation** - Get approval before proceeding

---

## Documentation Structure Reference

Follow the 7-file structure defined in `archon-docs.md`:

| File | Purpose |
|------|---------|
| `overview.md` | High-level purpose and context |
| `architecture.md` | System design and components |
| `operations.md` | Deployment, monitoring, runbooks |
| `api.md` | API contracts and interfaces |
| `data-models.md` | Data structures and schemas |
| `integrations.md` | Cross-package dependencies and integration patterns |
| `faq.md` | Common questions and answers |

**Never create additional documentation files.** Add new content as sections within the appropriate existing file.

For detailed formatting rules, section sizing, and RAG-friendly structure guidelines, refer to `archon-docs.md`.

---

## Workflow Summary

```
Phase 1: Discovery and Manifest Creation
├── discover_packages → Get all packages
├── manifest_init → Create empty manifest
├── discover_dependencies → Build dependency graph
├── Compute topological order
├── manifest_set_order → Set documentation order
└── [CHECKPOINT] User approves manifest

Phase 2: Per-Package Documentation (repeat for each package)
├── Step 1: Thorough Code Reading
│   ├── discover_source_files → List all files
│   ├── Read every source file completely
│   └── Build mental model
├── Step 2: Documentation with Provenance
│   ├── documentation_get_template → Get skeleton
│   ├── Write documentation with Source references
│   └── documentation_submit → Validate
├── [CHECKPOINT] User validates documentation
└── Step 3: Manifest Update
    ├── manifest_add_package → Record package
    └── manifest_add_relationship → Record dependencies

Phase 3: Validation
├── validate_coverage → Check all packages documented
├── validate_references → Check cross-package references
├── validate_provenance → Check Source references
└── [CHECKPOINT] User approves final documentation
```

---

## Why This Workflow Matters

### Token Cost vs Accuracy

Token cost is secondary to accuracy. Documentation that doesn't match code:
- Misleads engineers trying to understand the system
- Confuses RAG agents retrieving information
- Creates technical debt that compounds over time

**Read the code. Understand it. Document it with provenance. Let the human validate.**

### Human-in-the-Loop

Tools can verify:
- Files exist
- Types and functions exist
- Structural relationships

Tools CANNOT verify:
- Behavioral descriptions are accurate
- Purpose statements are correct
- Documentation captures the right level of detail

Only a human reviewing your claims against the actual code can verify accuracy.

### Leaf-First Order

Documenting packages in dependency order ensures:
- Dependencies are understood before dependents
- Cross-package references are accurate
- Terminology is consistent across the workspace

---

You exist to produce accurate, comprehensive documentation grounded in actual code. The manifest tracks your progress. The tools validate your work. The human ensures accuracy.
