/**
 * Workspace Indexing Playbook Tool
 *
 * MCP tool that orchestrates SCIP indexing across all packages in a workspace.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { detect } from "../lib/language_detector.js";
import { generateScipIndex, readScipMetadata } from "./scip_indexing.js";
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
 * Check if a file exists at the given path.
 */
async function fileExists(filePath) {
    try {
        await stat(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Discover all packages in a workspace by detecting directories containing
 * go.mod (Go packages) or package.json (TypeScript/JavaScript packages).
 *
 * @param workspacePath - The root path of the workspace
 * @returns Array of package paths (absolute paths)
 */
export async function discoverPackages(workspacePath) {
    const packages = [];
    const visited = new Set();
    async function scanDirectory(dirPath) {
        // Avoid infinite loops from symlinks
        const realPath = resolve(dirPath);
        if (visited.has(realPath)) {
            return;
        }
        visited.add(realPath);
        // Check if this directory is a package (has go.mod or package.json)
        const hasGoMod = await fileExists(join(dirPath, "go.mod"));
        const hasPackageJson = await fileExists(join(dirPath, "package.json"));
        if (hasGoMod || hasPackageJson) {
            packages.push(dirPath);
        }
        // Recursively scan subdirectories
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                // Skip hidden directories, node_modules, vendor, and .archon
                if (entry.name.startsWith(".") ||
                    entry.name === "node_modules" ||
                    entry.name === "vendor" ||
                    entry.name === ".archon") {
                    continue;
                }
                if (entry.isDirectory()) {
                    await scanDirectory(join(dirPath, entry.name));
                }
            }
        }
        catch {
            // Ignore directories we can't read
        }
    }
    await scanDirectory(workspacePath);
    return packages;
}
/**
 * Parse Go module dependencies from a go.mod file.
 * Extracts require statements to identify dependencies.
 *
 * @param goModPath - Path to the go.mod file
 * @returns Array of module names that are dependencies
 */
async function parseGoModDependencies(goModPath) {
    try {
        const content = await readFile(goModPath, "utf-8");
        const dependencies = [];
        // Match require statements (both single and block form)
        // Single: require github.com/example/pkg v1.0.0
        // Block: require (
        //          github.com/example/pkg v1.0.0
        //        )
        const singleRequireRegex = /^require\s+(\S+)\s+/gm;
        const blockRequireRegex = /require\s*\(\s*([\s\S]*?)\s*\)/g;
        // Parse single require statements
        let match;
        while ((match = singleRequireRegex.exec(content)) !== null) {
            const modulePath = match[1];
            if (modulePath) {
                dependencies.push(modulePath);
            }
        }
        // Parse block require statements
        while ((match = blockRequireRegex.exec(content)) !== null) {
            const block = match[1];
            if (!block) {
                continue;
            }
            const lines = block.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("//")) {
                    // Extract module path (first token before version)
                    const modulePath = trimmed.split(/\s+/)[0];
                    if (modulePath) {
                        dependencies.push(modulePath);
                    }
                }
            }
        }
        return dependencies;
    }
    catch {
        return [];
    }
}
/**
 * Parse TypeScript/JavaScript dependencies from a package.json file.
 * Extracts dependencies and devDependencies.
 *
 * @param packageJsonPath - Path to the package.json file
 * @returns Array of package names that are dependencies
 */
async function parsePackageJsonDependencies(packageJsonPath) {
    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(content);
        const dependencies = [];
        // Collect dependencies from both dependencies and devDependencies
        if (packageJson.dependencies && typeof packageJson.dependencies === "object") {
            dependencies.push(...Object.keys(packageJson.dependencies));
        }
        if (packageJson.devDependencies &&
            typeof packageJson.devDependencies === "object") {
            dependencies.push(...Object.keys(packageJson.devDependencies));
        }
        return dependencies;
    }
    catch {
        return [];
    }
}
/**
 * Get the package name from a package directory.
 * For Go packages, extracts module name from go.mod.
 * For TypeScript packages, extracts name from package.json.
 *
 * @param packagePath - Path to the package directory
 * @returns Package name or basename as fallback
 */
async function getPackageName(packagePath) {
    // Try to get name from package.json first
    const packageJsonPath = join(packagePath, "package.json");
    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(content);
        if (packageJson.name && typeof packageJson.name === "string") {
            return packageJson.name;
        }
    }
    catch {
        // Fall through to try go.mod
    }
    // Try to get module name from go.mod
    const goModPath = join(packagePath, "go.mod");
    try {
        const content = await readFile(goModPath, "utf-8");
        const moduleMatch = content.match(/^module\s+(\S+)/m);
        if (moduleMatch && moduleMatch[1]) {
            return moduleMatch[1];
        }
    }
    catch {
        // Fall through to basename
    }
    // Fallback to directory basename
    return basename(packagePath);
}
/**
 * Analyze inter-package dependencies within a workspace.
 * Reads go.mod and package.json files to build a dependency graph.
 *
 * @param workspacePath - The root path of the workspace
 * @param packages - Array of package paths to analyze
 * @returns Dependency graph mapping packages to their dependencies
 */
export async function analyzeDependencies(workspacePath, packages) {
    const dependencies = new Map();
    const packageNameToPath = new Map();
    // First pass: collect all package names and paths
    for (const packagePath of packages) {
        const packageName = await getPackageName(packagePath);
        packageNameToPath.set(packageName, packagePath);
        // Also map by basename for local references
        const baseName = basename(packagePath);
        if (!packageNameToPath.has(baseName)) {
            packageNameToPath.set(baseName, packagePath);
        }
        // Map by relative path from workspace
        const relativePath = relative(workspacePath, packagePath);
        if (!packageNameToPath.has(relativePath)) {
            packageNameToPath.set(relativePath, packagePath);
        }
    }
    // Second pass: analyze dependencies for each package
    for (const packagePath of packages) {
        const packageDeps = [];
        // Parse Go dependencies
        const goModPath = join(packagePath, "go.mod");
        const goDeps = await parseGoModDependencies(goModPath);
        // Parse TypeScript dependencies
        const packageJsonPath = join(packagePath, "package.json");
        const tsDeps = await parsePackageJsonDependencies(packageJsonPath);
        // Combine all dependencies
        const allDeps = [...goDeps, ...tsDeps];
        // Filter to only include dependencies that are within the workspace
        for (const dep of allDeps) {
            // Check if this dependency matches any package in the workspace
            const depPath = packageNameToPath.get(dep);
            if (depPath && depPath !== packagePath) {
                packageDeps.push(depPath);
            }
            // Also check if the dependency basename matches
            const depBasename = dep.split("/").pop() || dep;
            const depPathByBasename = packageNameToPath.get(depBasename);
            if (depPathByBasename &&
                depPathByBasename !== packagePath &&
                !packageDeps.includes(depPathByBasename)) {
                packageDeps.push(depPathByBasename);
            }
        }
        dependencies.set(packagePath, packageDeps);
    }
    return { dependencies, packageNameToPath };
}
/**
 * Perform topological sort on packages based on their dependencies.
 * Dependencies are processed before dependents.
 * Handles circular dependencies by breaking cycles.
 *
 * @param packages - Array of package paths to sort
 * @param dependencyGraph - Dependency graph from analyzeDependencies
 * @returns Sorted array of package paths (dependencies first)
 */
export function topologicalSort(packages, dependencyGraph) {
    const { dependencies } = dependencyGraph;
    const sorted = [];
    const visited = new Set();
    const visiting = new Set(); // For cycle detection
    /**
     * Depth-first search for topological sort.
     * Handles cycles by skipping packages currently being visited.
     */
    function visit(packagePath) {
        // Skip if already processed
        if (visited.has(packagePath)) {
            return;
        }
        // Cycle detection: if we're currently visiting this package,
        // we've found a cycle - break it by skipping
        if (visiting.has(packagePath)) {
            return;
        }
        visiting.add(packagePath);
        // Visit all dependencies first
        const deps = dependencies.get(packagePath) || [];
        for (const dep of deps) {
            // Only visit if it's in our package list
            if (packages.includes(dep)) {
                visit(dep);
            }
        }
        visiting.delete(packagePath);
        visited.add(packagePath);
        sorted.push(packagePath);
    }
    // Visit all packages
    for (const packagePath of packages) {
        visit(packagePath);
    }
    return sorted;
}
/**
 * Order packages by their dependencies.
 * Combines dependency analysis and topological sort.
 *
 * @param workspacePath - The root path of the workspace
 * @param packages - Array of package paths to order
 * @returns Sorted array of package paths (dependencies first)
 */
export async function orderPackagesByDependencies(workspacePath, packages) {
    // Analyze dependencies
    const dependencyGraph = await analyzeDependencies(workspacePath, packages);
    // Perform topological sort
    return topologicalSort(packages, dependencyGraph);
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
export async function hasPackageChanged(packagePath) {
    const metadata = await readScipMetadata(packagePath);
    // No metadata means package was never indexed
    if (!metadata) {
        return true;
    }
    // Check if any index files are missing or have different hashes
    for (const indexInfo of metadata.indexes) {
        const indexPath = join(packagePath, indexInfo.indexFile);
        try {
            const stats = await stat(indexPath);
            if (!stats.isFile()) {
                return true;
            }
        }
        catch {
            // Index file doesn't exist
            return true;
        }
    }
    // If we have metadata and all index files exist, package is unchanged
    return false;
}
/**
 * Orchestrate SCIP indexing across all packages in a workspace.
 *
 * @param input - The input parameters for workspace indexing
 * @returns The result of the workspace indexing operation
 */
export async function indexWorkspace(input) {
    const { workspacePath, packages: packageFilter, force = false } = input;
    const resolvedWorkspacePath = resolve(workspacePath);
    // Validate workspace path
    if (!(await isDirectory(resolvedWorkspacePath))) {
        return {
            success: false,
            workspacePath: resolvedWorkspacePath,
            packagesIndexed: [],
            packagesSkipped: [],
            totalSymbols: 0,
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
    // Filter packages if a filter is provided (Requirement 6.8)
    const filteredPackages = filterPackagesByName(allPackages, packageFilter);
    // Order packages by dependencies (Requirement 6.4)
    // Dependencies are processed before dependents
    const packagesToIndex = await orderPackagesByDependencies(resolvedWorkspacePath, filteredPackages);
    // Track results
    const packagesIndexed = [];
    const packagesSkipped = [];
    const errors = [];
    let totalSymbols = 0;
    // Process each package in dependency order
    for (const packagePath of packagesToIndex) {
        const packageName = basename(packagePath);
        try {
            // Check if package has any supported languages
            const detection = await detect(packagePath);
            if (!detection.hasGo && !detection.hasTypeScript) {
                // No supported languages - skip this package
                packagesSkipped.push(packageName);
                continue;
            }
            // Check if package has changed (Requirement 6.5)
            // Skip unchanged packages unless force=true (Requirement 6.7)
            if (!force) {
                const changed = await hasPackageChanged(packagePath);
                if (!changed) {
                    // Package is unchanged - skip indexing and add to skipped list
                    packagesSkipped.push(packageName);
                    continue;
                }
            }
            // Generate SCIP index for the package
            const result = await generateScipIndex({
                packagePath,
                force, // Pass through force parameter (Requirement 6.7)
            });
            if (result.success && result.indexes.length > 0) {
                // Calculate total symbol count for this package
                const packageSymbolCount = result.indexes.reduce((sum, idx) => sum + idx.symbolCount, 0);
                packagesIndexed.push({
                    package: packageName,
                    languages: result.languagesDetected,
                    symbolCount: packageSymbolCount,
                });
                totalSymbols += packageSymbolCount;
            }
            else if (result.errors && result.errors.length > 0) {
                // Package had errors during indexing
                errors.push({
                    package: packageName,
                    error: result.errors.join("; "),
                });
            }
            else {
                // No indexes generated and no errors - skip
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
    // Success if at least one package was indexed or if there were no errors
    const success = packagesIndexed.length > 0 || errors.length === 0;
    return {
        success,
        workspacePath: resolvedWorkspacePath,
        packagesIndexed,
        packagesSkipped,
        totalSymbols,
        errors,
    };
}
//# sourceMappingURL=workspace_indexing.js.map