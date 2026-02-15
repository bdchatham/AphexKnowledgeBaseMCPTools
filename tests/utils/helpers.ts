/**
 * Test Helper Functions
 *
 * Reusable helper functions for test setup, teardown, and common operations
 * across all test files.
 *
 * @see Design Document: Testing Strategy
 */

import { mkdir, writeFile, rm, readFile, access } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import type { PackageType } from "./generators.js";

// ============================================================================
// Temporary Directory Management
// ============================================================================

/**
 * Counter for generating unique test directory names
 */
let testDirCounter = 0;

/**
 * Creates a unique temporary directory for test isolation.
 * Each test should use its own directory to prevent interference.
 *
 * @param prefix - Optional prefix for the directory name
 * @returns Absolute path to the created directory
 *
 * @example
 * ```typescript
 * const testDir = await createTestDir("my-test");
 * // Use testDir for test operations
 * await cleanupTestDir(testDir);
 * ```
 */
export async function createTestDir(prefix = "test"): Promise<string> {
  const testDir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${testDirCounter++}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Cleans up a temporary test directory.
 * Silently ignores errors if the directory doesn't exist or can't be removed.
 *
 * @param testDir - Path to the directory to clean up
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors - directory may not exist or be locked
  }
}

/**
 * Creates a test directory and returns a cleanup function.
 * Useful for test setup/teardown patterns.
 *
 * @param prefix - Optional prefix for the directory name
 * @returns Object with testDir path and cleanup function
 *
 * @example
 * ```typescript
 * const { testDir, cleanup } = await createTestDirWithCleanup("my-test");
 * try {
 *   // Use testDir for test operations
 * } finally {
 *   await cleanup();
 * }
 * ```
 */
export async function createTestDirWithCleanup(prefix = "test"): Promise<{
  testDir: string;
  cleanup: () => Promise<void>;
}> {
  const testDir = await createTestDir(prefix);
  return {
    testDir,
    cleanup: () => cleanupTestDir(testDir),
  };
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Creates a file with the given content, creating parent directories as needed.
 *
 * @param filePath - Absolute path to the file
 * @param content - Content to write to the file
 */
export async function createFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/**
 * Creates multiple files in a directory.
 *
 * @param baseDir - Base directory for the files
 * @param files - Map of relative paths to content
 *
 * @example
 * ```typescript
 * await createFiles(testDir, {
 *   "src/index.ts": "export const x = 1;",
 *   "package.json": '{"name": "test"}',
 * });
 * ```
 */
export async function createFiles(
  baseDir: string,
  files: Record<string, string>
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await createFile(join(baseDir, relativePath), content);
  }
}

/**
 * Checks if a file exists.
 *
 * @param filePath - Path to check
 * @returns True if the file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a file and returns its content, or undefined if it doesn't exist.
 *
 * @param filePath - Path to the file
 * @returns File content or undefined
 */
export async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

// ============================================================================
// Package Structure Helpers
// ============================================================================

/**
 * Creates a go.mod file content.
 *
 * @param moduleName - Go module name (e.g., "example.com/mymodule")
 * @param goVersion - Go version (default: "1.21")
 * @returns go.mod file content
 */
export function createGoModContent(moduleName: string, goVersion = "1.21"): string {
  return `module ${moduleName}

go ${goVersion}
`;
}

/**
 * Creates a go.mod file content with dependencies.
 *
 * @param moduleName - Go module name
 * @param dependencies - Array of dependency module names
 * @param goVersion - Go version (default: "1.21")
 * @returns go.mod file content with require block
 */
export function createGoModContentWithDeps(
  moduleName: string,
  dependencies: string[],
  goVersion = "1.21"
): string {
  let content = `module ${moduleName}

go ${goVersion}
`;

  if (dependencies.length > 0) {
    content += "\nrequire (\n";
    for (const dep of dependencies) {
      content += `\t${dep} v1.0.0\n`;
    }
    content += ")\n";
  }

  return content;
}

/**
 * Creates a package.json file content.
 *
 * @param name - Package name
 * @param version - Package version (default: "1.0.0")
 * @returns package.json file content
 */
export function createPackageJsonContent(name: string, version = "1.0.0"): string {
  return JSON.stringify({ name, version }, null, 2);
}

/**
 * Creates a package.json file content with dependencies.
 *
 * @param name - Package name
 * @param dependencies - Array of dependency package names
 * @param version - Package version (default: "1.0.0")
 * @returns package.json file content with dependencies
 */
export function createPackageJsonContentWithDeps(
  name: string,
  dependencies: string[],
  version = "1.0.0"
): string {
  const deps: Record<string, string> = {};
  for (const dep of dependencies) {
    deps[dep] = "^1.0.0";
  }

  return JSON.stringify(
    {
      name,
      version,
      dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    },
    null,
    2
  );
}

/**
 * Creates a minimal Go source file.
 *
 * @param packageName - Go package name (default: "main")
 * @param functionName - Optional function to include
 * @returns Go source file content
 */
export function createGoSourceFile(packageName = "main", functionName?: string): string {
  let content = `package ${packageName}\n`;

  if (functionName) {
    content += `
func ${functionName}() {}
`;
    if (packageName === "main") {
      content += `
func main() {
    ${functionName}()
}
`;
    }
  }

  return content;
}

/**
 * Creates a minimal TypeScript source file.
 *
 * @param exportName - Name of the exported constant
 * @param value - Value to export (default: "1")
 * @returns TypeScript source file content
 */
export function createTypeScriptSourceFile(exportName: string, value = "1"): string {
  return `export const ${exportName} = ${value};\n`;
}

/**
 * Represents a package to be created in a test workspace.
 */
export interface TestPackage {
  /** Relative path segments from workspace root */
  pathSegments: string[];
  /** Type of package (go, typescript, or both) */
  type: PackageType;
  /** Package name */
  name: string;
  /** Optional dependencies (package names) */
  dependencies?: string[];
}

/**
 * Creates a test package in the specified directory.
 *
 * @param baseDir - Base directory for the package
 * @param pkg - Package configuration
 * @returns Absolute path to the created package
 */
export async function createTestPackage(
  baseDir: string,
  pkg: TestPackage
): Promise<string> {
  const packagePath = join(baseDir, ...pkg.pathSegments);
  await mkdir(packagePath, { recursive: true });

  // Create package marker files based on type
  if (pkg.type === "go" || pkg.type === "both") {
    const goModContent = pkg.dependencies
      ? createGoModContentWithDeps(`example.com/${pkg.name}`, pkg.dependencies)
      : createGoModContent(`example.com/${pkg.name}`);
    await writeFile(join(packagePath, "go.mod"), goModContent);
    await writeFile(join(packagePath, "main.go"), createGoSourceFile("main", "Run"));
  }

  if (pkg.type === "typescript" || pkg.type === "both") {
    const packageJsonContent = pkg.dependencies
      ? createPackageJsonContentWithDeps(pkg.name, pkg.dependencies)
      : createPackageJsonContent(pkg.name);
    await writeFile(join(packagePath, "package.json"), packageJsonContent);
    await writeFile(join(packagePath, "index.ts"), createTypeScriptSourceFile("main"));
  }

  return packagePath;
}

/**
 * Creates a test workspace with multiple packages.
 *
 * @param workspaceRoot - Root directory for the workspace
 * @param packages - Array of packages to create
 * @returns Array of absolute paths to created packages
 */
export async function createTestWorkspace(
  workspaceRoot: string,
  packages: TestPackage[]
): Promise<string[]> {
  const createdPaths: string[] = [];

  for (const pkg of packages) {
    const packagePath = await createTestPackage(workspaceRoot, pkg);
    createdPaths.push(packagePath);
  }

  return createdPaths;
}

// ============================================================================
// Documentation Helpers
// ============================================================================

/**
 * Gets the expected documentation path for a source file.
 * For a source file at `<dir>/<name>.<ext>`, returns `<dir>/<name>.archon.md`.
 *
 * @param sourcePath - Path to the source file
 * @returns Expected documentation file path
 */
export function getExpectedDocPath(sourcePath: string): string {
  const lastDotIndex = sourcePath.lastIndexOf(".");
  if (lastDotIndex > 0) {
    return `${sourcePath.slice(0, lastDotIndex)}.archon.md`;
  }
  return `${sourcePath}.archon.md`;
}

/**
 * Extracts the directory from a file path.
 *
 * @param filePath - File path
 * @returns Directory path, or empty string if file is at root
 */
export function getDirectory(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  if (lastSlashIndex > 0) {
    return filePath.slice(0, lastSlashIndex);
  }
  return "";
}

/**
 * Extracts the file name without extension from a file path.
 * Handles both regular extensions (.ts, .js) and compound extensions (.archon.md).
 *
 * @param filePath - File path
 * @returns File name without extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  const fileName = lastSlashIndex >= 0 ? filePath.slice(lastSlashIndex + 1) : filePath;

  // Handle .archon.md extension specially
  if (fileName.endsWith(".archon.md")) {
    return fileName.slice(0, -".archon.md".length);
  }

  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex > 0) {
    return fileName.slice(0, lastDotIndex);
  }
  return fileName;
}

/**
 * Creates a documentation file with manual sections.
 *
 * @param docPath - Path to the documentation file
 * @param symbolName - Name of the documented symbol
 * @param manualContent - Content for the manual section
 */
export async function createDocWithManualSection(
  docPath: string,
  symbolName: string,
  manualContent: string
): Promise<void> {
  const content = `# ${symbolName}

<!-- archon:generated -->

## Purpose

Auto-generated documentation.

<!-- archon:manual -->
${manualContent}
<!-- /archon:manual -->
`;
  await createFile(docPath, content);
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Verifies that all dependencies appear before their dependents in a sorted order.
 *
 * @param sortedPackages - Array of package paths in sorted order
 * @param packagePaths - Map of package name to path
 * @param dependencyMap - Map of package name to its dependencies
 * @returns True if order is valid, false otherwise
 */
export function verifyDependencyOrder(
  sortedPackages: string[],
  packagePaths: Map<string, string>,
  dependencyMap: Map<string, string[]>
): boolean {
  // Create reverse map: path -> name
  const pathToName = new Map<string, string>();
  for (const [name, path] of packagePaths) {
    pathToName.set(path, name);
  }

  // Create position map for sorted packages
  const positionMap = new Map<string, number>();
  for (let i = 0; i < sortedPackages.length; i++) {
    const path = sortedPackages[i]!;
    const name = pathToName.get(path);
    if (name) {
      positionMap.set(name, i);
    }
  }

  // Verify each package's dependencies appear before it
  for (const [name, deps] of dependencyMap) {
    const packagePosition = positionMap.get(name);
    if (packagePosition === undefined) {
      continue; // Package not in sorted list
    }

    for (const dep of deps) {
      const depPosition = positionMap.get(dep);
      if (depPosition === undefined) {
        continue; // Dependency not in sorted list (external dependency)
      }

      // Dependency must appear before the dependent
      if (depPosition >= packagePosition) {
        return false;
      }
    }
  }

  return true;
}

// ============================================================================
// SCIP Index Helpers
// ============================================================================

/**
 * Minimal proto schema for testing SCIP indexes.
 * This is a simplified version that only includes what we need for tests.
 */
export const MINIMAL_SCIP_PROTO = `
syntax = "proto3";
package scip;

message Index {
  Metadata metadata = 1;
  repeated Document documents = 2;
  repeated SymbolInformation external_symbols = 3;
}

message Metadata {
  int32 version = 1;
  ToolInfo tool_info = 2;
  string project_root = 3;
}

message ToolInfo {
  string name = 1;
  string version = 2;
}

message Document {
  string language = 1;
  string relative_path = 2;
  repeated Occurrence occurrences = 3;
  repeated SymbolInformation symbols = 4;
}

message Occurrence {
  repeated int32 range = 1;
  string symbol = 2;
  int32 symbol_roles = 3;
}

message SymbolInformation {
  string symbol = 1;
  repeated string documentation = 2;
  repeated Relationship relationships = 3;
  int32 kind = 4;
  string display_name = 5;
  SignatureDocumentation signature_documentation = 6;
  string enclosing_symbol = 7;
}

message Relationship {
  string symbol = 1;
  bool is_reference = 2;
  bool is_implementation = 3;
  bool is_type_definition = 4;
  bool is_definition = 5;
}

message SignatureDocumentation {
  string text = 1;
}
`;

/**
 * Symbol role bit flags from SCIP protocol.
 */
export const SymbolRole = {
  Definition: 0x1,
  Import: 0x2,
  WriteAccess: 0x4,
  ReadAccess: 0x8,
  Generated: 0x10,
  Test: 0x20,
  ForwardDefinition: 0x40,
} as const;

// ============================================================================
// Test Timeout Constants
// ============================================================================

/**
 * Default timeout for tests that invoke external tools (e.g., scip-go, scip-typescript).
 */
export const TOOL_INVOCATION_TIMEOUT = 30000; // 30 seconds

/**
 * Extended timeout for tests that invoke multiple external tools.
 */
export const EXTENDED_TOOL_TIMEOUT = 60000; // 60 seconds

/**
 * Default number of iterations for property-based tests.
 */
export const DEFAULT_PBT_ITERATIONS = 100;

/**
 * Reduced iterations for tests that invoke external tools.
 */
export const REDUCED_PBT_ITERATIONS = 15;
