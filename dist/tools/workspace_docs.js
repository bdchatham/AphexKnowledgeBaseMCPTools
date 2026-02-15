/**
 * Workspace Documentation Playbook Tool
 *
 * MCP tool that orchestrates documentation generation across all packages
 * in a workspace.
 */
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { generateArchonDoc } from "./doc_generation.js";
import { discoverPackages, orderPackagesByDependencies, hasPackageChanged } from "./workspace_indexing.js";
/**
 * Check if a path is a directory.
 */
async function isDirectory(dirPath) {
    try {
        const stats = await stat(dirPath);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Filter packages based on the packages parameter.
 * Matches by package name (basename of path) or full path.
 *
 * @param allPackages - All discovered package paths
 * @param filterPackages - Optional array of package names/paths to include
 * @returns Filtered array of package paths
 */
function filterPackagesByName(allPackages, filterPackages) {
    if (!filterPackages || filterPackages.length === 0) {
        return allPackages;
    }
    const filterSet = new Set(filterPackages.map((p) => p.toLowerCase()));
    return allPackages.filter((packagePath) => {
        const packageName = basename(packagePath).toLowerCase();
        const normalizedPath = packagePath.toLowerCase();
        // Match by package name or full path
        return (filterSet.has(packageName) ||
            filterSet.has(normalizedPath) ||
            filterPackages.some((filter) => normalizedPath.endsWith(filter.toLowerCase()) ||
                packagePath.includes(filter)));
    });
}
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
export async function documentWorkspace(input) {
    const { workspacePath, packages: packageFilter, force = false } = input;
    const resolvedWorkspacePath = resolve(workspacePath);
    // Validate workspace path
    if (!(await isDirectory(resolvedWorkspacePath))) {
        return {
            success: false,
            workspacePath: resolvedWorkspacePath,
            packagesDocumented: [],
            packagesSkipped: [],
            totalFilesGenerated: 0,
            totalArns: 0,
            errors: [
                {
                    package: resolvedWorkspacePath,
                    error: `Workspace path does not exist or is not a directory: ${resolvedWorkspacePath}`,
                },
            ],
        };
    }
    // Discover all packages in the workspace
    const allPackages = await discoverPackages(resolvedWorkspacePath);
    // Filter packages if a filter is provided (Requirement 7.7)
    const filteredPackages = filterPackagesByName(allPackages, packageFilter);
    // Order packages by dependencies (dependencies first)
    const packagesToDocument = await orderPackagesByDependencies(resolvedWorkspacePath, filteredPackages);
    // Track results
    const packagesDocumented = [];
    const packagesSkipped = [];
    const errors = [];
    let totalFilesGenerated = 0;
    let totalArns = 0;
    // Process each package in dependency order
    for (const packagePath of packagesToDocument) {
        const packageName = basename(packagePath);
        try {
            // Check if package has changed using hash comparison (Requirement 7.3)
            // Skip unchanged packages unless force=true (Requirement 7.6)
            if (!force) {
                const changed = await hasPackageChanged(packagePath);
                if (!changed) {
                    // Package SCIP indexes are unchanged - skip documentation generation
                    packagesSkipped.push(packageName);
                    continue;
                }
            }
            // Generate documentation for the package
            const result = await generateArchonDoc({
                packagePath,
                force, // Pass through force parameter (Requirement 7.6)
            });
            if (result.success && result.filesGenerated.length > 0) {
                // Collect ARNs from generated files
                const arnsCreated = result.filesGenerated.map((f) => f.arn);
                packagesDocumented.push({
                    package: packageName,
                    filesGenerated: result.filesGenerated.length,
                    arnsCreated,
                });
                totalFilesGenerated += result.filesGenerated.length;
                totalArns += arnsCreated.length;
            }
            else if (result.errors && result.errors.length > 0) {
                // Package had errors during documentation generation
                errors.push({
                    package: packageName,
                    error: result.errors.join("; "),
                });
            }
            else if (result.filesSkipped.length > 0 && result.filesGenerated.length === 0) {
                // All files were skipped (unchanged) - add to skipped list
                packagesSkipped.push(packageName);
            }
            else {
                // No files generated and no errors - skip (likely no SCIP index)
                packagesSkipped.push(packageName);
            }
        }
        catch (error) {
            // Unexpected error processing package
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({
                package: packageName,
                error: `Unexpected error: ${errorMessage}`,
            });
        }
    }
    // Determine overall success
    // Success if at least one package was documented or if there were no errors
    const success = packagesDocumented.length > 0 || errors.length === 0;
    return {
        success,
        workspacePath: resolvedWorkspacePath,
        packagesDocumented,
        packagesSkipped,
        totalFilesGenerated,
        totalArns,
        errors,
    };
}
//# sourceMappingURL=workspace_docs.js.map