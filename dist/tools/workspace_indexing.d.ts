/**
 * Workspace Indexing Playbook Tool
 *
 * MCP tool that orchestrates SCIP indexing across all packages in a workspace.
 */
import type { IndexWorkspaceInput, IndexWorkspaceOutput } from "../types/tools.js";
/**
 * Discover all packages in a workspace by detecting directories containing
 * go.mod (Go packages) or package.json (TypeScript/JavaScript packages).
 *
 * @param workspacePath - The root path of the workspace
 * @returns Array of package paths (absolute paths)
 */
export declare function discoverPackages(workspacePath: string): Promise<string[]>;
/**
 * Represents a dependency graph for packages in a workspace.
 * Maps package paths to their dependencies (other package paths).
 */
export interface DependencyGraph {
    /** Map of package path to array of dependency package paths */
    dependencies: Map<string, string[]>;
    /** Map of package name to package path for resolution */
    packageNameToPath: Map<string, string>;
}
/**
 * Analyze inter-package dependencies within a workspace.
 * Reads go.mod and package.json files to build a dependency graph.
 *
 * @param workspacePath - The root path of the workspace
 * @param packages - Array of package paths to analyze
 * @returns Dependency graph mapping packages to their dependencies
 */
export declare function analyzeDependencies(workspacePath: string, packages: string[]): Promise<DependencyGraph>;
/**
 * Perform topological sort on packages based on their dependencies.
 * Dependencies are processed before dependents.
 * Handles circular dependencies by breaking cycles.
 *
 * @param packages - Array of package paths to sort
 * @param dependencyGraph - Dependency graph from analyzeDependencies
 * @returns Sorted array of package paths (dependencies first)
 */
export declare function topologicalSort(packages: string[], dependencyGraph: DependencyGraph): string[];
/**
 * Order packages by their dependencies.
 * Combines dependency analysis and topological sort.
 *
 * @param workspacePath - The root path of the workspace
 * @param packages - Array of package paths to order
 * @returns Sorted array of package paths (dependencies first)
 */
export declare function orderPackagesByDependencies(workspacePath: string, packages: string[]): Promise<string[]>;
/**
 * Check if a package has changed since last indexing.
 * Compares stored metadata hashes with current state.
 *
 * A package is considered changed if:
 * - No metadata.json exists (never indexed)
 * - The metadata.json cannot be read
 * - The stored hashes don't match current index hashes
 *
 * @param packagePath - Path to the package
 * @returns True if the package has changed or needs indexing, false if unchanged
 */
export declare function hasPackageChanged(packagePath: string): Promise<boolean>;
/**
 * Orchestrate SCIP indexing across all packages in a workspace.
 *
 * @param input - The input parameters for workspace indexing
 * @returns The result of the workspace indexing operation
 */
export declare function indexWorkspace(input: IndexWorkspaceInput): Promise<IndexWorkspaceOutput>;
//# sourceMappingURL=workspace_indexing.d.ts.map