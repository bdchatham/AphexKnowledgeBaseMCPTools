/**
 * Workspace Documentation Playbook Tool
 *
 * MCP tool that orchestrates documentation generation across all packages
 * in a workspace.
 */
import type { DocumentWorkspaceInput, DocumentWorkspaceOutput } from "../types/tools.js";
/**
 * Orchestrate documentation generation across all packages in a workspace.
 *
 * This tool:
 * 1. Discovers all packages in the workspace
 * 2. Filters packages if the `packages` parameter is provided (Requirement 7.7)
 * 3. Orders packages by dependencies (dependencies first)
 * 4. Checks if packages have changed using hash comparison (Requirement 7.3)
 * 5. Generates documentation for each changed package using generateArchonDoc
 * 6. Supports force regeneration with the `force` parameter
 *
 * @param input - The input parameters for workspace documentation
 * @returns The result of the workspace documentation operation
 */
export declare function documentWorkspace(input: DocumentWorkspaceInput): Promise<DocumentWorkspaceOutput>;
//# sourceMappingURL=workspace_docs.d.ts.map