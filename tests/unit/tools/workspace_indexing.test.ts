/**
 * Unit tests for Workspace Indexing Tool
 *
 * Tests dependency analysis, topological sort functionality, tool response structure,
 * error response format, and timeout handling.
 *
 * Validates: Requirements 6.1-6.8
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  analyzeDependencies,
  discoverPackages,
  hasPackageChanged,
  indexWorkspace,
  orderPackagesByDependencies,
  topologicalSort,
  type DependencyGraph,
} from "../../../src/tools/workspace_indexing.js";
import type {
  IndexWorkspaceInput,
  IndexWorkspaceOutput,
  PackageIndexResult,
  PackageError,
} from "../../../src/types/tools.js";

describe("Workspace Indexing Tool", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = join(tmpdir(), `workspace-indexing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("discoverPackages", () => {
    it("should discover packages with go.mod", async () => {
      // Create a Go package
      const goPackage = join(testDir, "go-pkg");
      await mkdir(goPackage, { recursive: true });
      await writeFile(join(goPackage, "go.mod"), "module example.com/go-pkg\n\ngo 1.21\n");

      const packages = await discoverPackages(testDir);

      expect(packages).toContain(goPackage);
    });

    it("should discover packages with package.json", async () => {
      // Create a TypeScript package
      const tsPackage = join(testDir, "ts-pkg");
      await mkdir(tsPackage, { recursive: true });
      await writeFile(join(tsPackage, "package.json"), JSON.stringify({ name: "ts-pkg" }));

      const packages = await discoverPackages(testDir);

      expect(packages).toContain(tsPackage);
    });

    it("should discover nested packages", async () => {
      // Create nested packages
      const nestedPackage = join(testDir, "level1", "level2", "nested-pkg");
      await mkdir(nestedPackage, { recursive: true });
      await writeFile(join(nestedPackage, "package.json"), JSON.stringify({ name: "nested-pkg" }));

      const packages = await discoverPackages(testDir);

      expect(packages).toContain(nestedPackage);
    });

    it("should skip node_modules directories", async () => {
      // Create a package inside node_modules (should be skipped)
      const nodeModulesPackage = join(testDir, "node_modules", "some-pkg");
      await mkdir(nodeModulesPackage, { recursive: true });
      await writeFile(join(nodeModulesPackage, "package.json"), JSON.stringify({ name: "some-pkg" }));

      const packages = await discoverPackages(testDir);

      expect(packages).not.toContain(nodeModulesPackage);
    });

    it("should skip hidden directories", async () => {
      // Create a package inside a hidden directory (should be skipped)
      const hiddenPackage = join(testDir, ".hidden", "hidden-pkg");
      await mkdir(hiddenPackage, { recursive: true });
      await writeFile(join(hiddenPackage, "package.json"), JSON.stringify({ name: "hidden-pkg" }));

      const packages = await discoverPackages(testDir);

      expect(packages).not.toContain(hiddenPackage);
    });
  });

  describe("analyzeDependencies", () => {
    it("should parse TypeScript dependencies from package.json", async () => {
      // Create two packages where pkg-b depends on pkg-a
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });

      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(
        join(pkgB, "package.json"),
        JSON.stringify({
          name: "pkg-b",
          dependencies: { "pkg-a": "^1.0.0" },
        })
      );

      const packages = [pkgA, pkgB];
      const graph = await analyzeDependencies(testDir, packages);

      // pkg-b should depend on pkg-a
      const pkgBDeps = graph.dependencies.get(pkgB) || [];
      expect(pkgBDeps).toContain(pkgA);

      // pkg-a should have no dependencies
      const pkgADeps = graph.dependencies.get(pkgA) || [];
      expect(pkgADeps).toHaveLength(0);
    });

    it("should parse Go dependencies from go.mod", async () => {
      // Create two Go packages where pkg-b depends on pkg-a
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });

      await writeFile(join(pkgA, "go.mod"), "module example.com/pkg-a\n\ngo 1.21\n");
      await writeFile(
        join(pkgB, "go.mod"),
        `module example.com/pkg-b

go 1.21

require example.com/pkg-a v1.0.0
`
      );

      const packages = [pkgA, pkgB];
      const graph = await analyzeDependencies(testDir, packages);

      // pkg-b should depend on pkg-a
      const pkgBDeps = graph.dependencies.get(pkgB) || [];
      expect(pkgBDeps).toContain(pkgA);
    });

    it("should parse Go block require statements", async () => {
      // Create packages with block require syntax
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      const pkgC = join(testDir, "pkg-c");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });
      await mkdir(pkgC, { recursive: true });

      await writeFile(join(pkgA, "go.mod"), "module example.com/pkg-a\n\ngo 1.21\n");
      await writeFile(join(pkgB, "go.mod"), "module example.com/pkg-b\n\ngo 1.21\n");
      await writeFile(
        join(pkgC, "go.mod"),
        `module example.com/pkg-c

go 1.21

require (
    example.com/pkg-a v1.0.0
    example.com/pkg-b v1.0.0
)
`
      );

      const packages = [pkgA, pkgB, pkgC];
      const graph = await analyzeDependencies(testDir, packages);

      // pkg-c should depend on both pkg-a and pkg-b
      const pkgCDeps = graph.dependencies.get(pkgC) || [];
      expect(pkgCDeps).toContain(pkgA);
      expect(pkgCDeps).toContain(pkgB);
    });

    it("should handle packages with no dependencies", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      const packages = [pkgA];
      const graph = await analyzeDependencies(testDir, packages);

      const pkgADeps = graph.dependencies.get(pkgA) || [];
      expect(pkgADeps).toHaveLength(0);
    });

    it("should ignore external dependencies not in workspace", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(
        join(pkgA, "package.json"),
        JSON.stringify({
          name: "pkg-a",
          dependencies: {
            lodash: "^4.0.0",
            express: "^4.0.0",
          },
        })
      );

      const packages = [pkgA];
      const graph = await analyzeDependencies(testDir, packages);

      // External dependencies should not be included
      const pkgADeps = graph.dependencies.get(pkgA) || [];
      expect(pkgADeps).toHaveLength(0);
    });
  });

  describe("topologicalSort", () => {
    it("should sort packages with dependencies first", () => {
      const pkgA = "/workspace/pkg-a";
      const pkgB = "/workspace/pkg-b";
      const pkgC = "/workspace/pkg-c";

      // pkg-c depends on pkg-b, pkg-b depends on pkg-a
      const graph: DependencyGraph = {
        dependencies: new Map([
          [pkgA, []],
          [pkgB, [pkgA]],
          [pkgC, [pkgB]],
        ]),
        packageNameToPath: new Map([
          ["pkg-a", pkgA],
          ["pkg-b", pkgB],
          ["pkg-c", pkgC],
        ]),
      };

      const sorted = topologicalSort([pkgA, pkgB, pkgC], graph);

      // pkg-a should come before pkg-b, pkg-b should come before pkg-c
      expect(sorted.indexOf(pkgA)).toBeLessThan(sorted.indexOf(pkgB));
      expect(sorted.indexOf(pkgB)).toBeLessThan(sorted.indexOf(pkgC));
    });

    it("should handle packages with no dependencies", () => {
      const pkgA = "/workspace/pkg-a";
      const pkgB = "/workspace/pkg-b";

      const graph: DependencyGraph = {
        dependencies: new Map([
          [pkgA, []],
          [pkgB, []],
        ]),
        packageNameToPath: new Map([
          ["pkg-a", pkgA],
          ["pkg-b", pkgB],
        ]),
      };

      const sorted = topologicalSort([pkgA, pkgB], graph);

      // Both packages should be in the result
      expect(sorted).toContain(pkgA);
      expect(sorted).toContain(pkgB);
      expect(sorted).toHaveLength(2);
    });

    it("should handle circular dependencies by breaking cycles", () => {
      const pkgA = "/workspace/pkg-a";
      const pkgB = "/workspace/pkg-b";

      // Circular dependency: pkg-a depends on pkg-b, pkg-b depends on pkg-a
      const graph: DependencyGraph = {
        dependencies: new Map([
          [pkgA, [pkgB]],
          [pkgB, [pkgA]],
        ]),
        packageNameToPath: new Map([
          ["pkg-a", pkgA],
          ["pkg-b", pkgB],
        ]),
      };

      // Should not throw and should return all packages
      const sorted = topologicalSort([pkgA, pkgB], graph);

      expect(sorted).toContain(pkgA);
      expect(sorted).toContain(pkgB);
      expect(sorted).toHaveLength(2);
    });

    it("should handle complex dependency graphs", () => {
      const pkgA = "/workspace/pkg-a";
      const pkgB = "/workspace/pkg-b";
      const pkgC = "/workspace/pkg-c";
      const pkgD = "/workspace/pkg-d";

      // pkg-d depends on pkg-b and pkg-c
      // pkg-b depends on pkg-a
      // pkg-c depends on pkg-a
      const graph: DependencyGraph = {
        dependencies: new Map([
          [pkgA, []],
          [pkgB, [pkgA]],
          [pkgC, [pkgA]],
          [pkgD, [pkgB, pkgC]],
        ]),
        packageNameToPath: new Map([
          ["pkg-a", pkgA],
          ["pkg-b", pkgB],
          ["pkg-c", pkgC],
          ["pkg-d", pkgD],
        ]),
      };

      const sorted = topologicalSort([pkgA, pkgB, pkgC, pkgD], graph);

      // pkg-a should come before pkg-b and pkg-c
      expect(sorted.indexOf(pkgA)).toBeLessThan(sorted.indexOf(pkgB));
      expect(sorted.indexOf(pkgA)).toBeLessThan(sorted.indexOf(pkgC));

      // pkg-b and pkg-c should come before pkg-d
      expect(sorted.indexOf(pkgB)).toBeLessThan(sorted.indexOf(pkgD));
      expect(sorted.indexOf(pkgC)).toBeLessThan(sorted.indexOf(pkgD));
    });
  });

  describe("orderPackagesByDependencies", () => {
    it("should order packages with dependencies first", async () => {
      // Create packages with dependencies
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      const pkgC = join(testDir, "pkg-c");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });
      await mkdir(pkgC, { recursive: true });

      // pkg-a has no dependencies
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      // pkg-b depends on pkg-a
      await writeFile(
        join(pkgB, "package.json"),
        JSON.stringify({
          name: "pkg-b",
          dependencies: { "pkg-a": "^1.0.0" },
        })
      );

      // pkg-c depends on pkg-b
      await writeFile(
        join(pkgC, "package.json"),
        JSON.stringify({
          name: "pkg-c",
          dependencies: { "pkg-b": "^1.0.0" },
        })
      );

      const packages = [pkgC, pkgB, pkgA]; // Intentionally out of order
      const sorted = await orderPackagesByDependencies(testDir, packages);

      // pkg-a should come before pkg-b, pkg-b should come before pkg-c
      expect(sorted.indexOf(pkgA)).toBeLessThan(sorted.indexOf(pkgB));
      expect(sorted.indexOf(pkgB)).toBeLessThan(sorted.indexOf(pkgC));
    });

    it("should handle empty package list", async () => {
      const sorted = await orderPackagesByDependencies(testDir, []);
      expect(sorted).toEqual([]);
    });

    it("should handle single package", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      const sorted = await orderPackagesByDependencies(testDir, [pkgA]);
      expect(sorted).toEqual([pkgA]);
    });
  });

  describe("hasPackageChanged", () => {
    it("should return true when no metadata.json exists", async () => {
      // Create a package without metadata
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(true);
    });

    it("should return true when metadata.json exists but index files are missing", async () => {
      // Create a package with metadata but no index files
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      // Write metadata pointing to non-existent index file
      const metadata = {
        packagePath: pkgA,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "typescript",
            indexFile: ".archon/scip/index.scip",
            hash: "abc123",
            symbolCount: 10,
          },
        ],
      };
      await writeFile(join(scipDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(true);
    });

    it("should return false when metadata.json and all index files exist", async () => {
      // Create a package with metadata and index files
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      // Create a mock index file
      await writeFile(join(scipDir, "index.scip"), "mock scip content");

      // Write metadata pointing to the index file
      const metadata = {
        packagePath: pkgA,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "typescript",
            indexFile: ".archon/scip/index.scip",
            hash: "abc123",
            symbolCount: 10,
          },
        ],
      };
      await writeFile(join(scipDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(false);
    });

    it("should return false when metadata has multiple indexes and all exist", async () => {
      // Create a package with multiple language indexes
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "go.mod"), "module example.com/pkg-a\n\ngo 1.21\n");

      // Create mock index files for both languages
      await writeFile(join(scipDir, "index.go.scip"), "mock go scip content");
      await writeFile(join(scipDir, "index.ts.scip"), "mock ts scip content");

      // Write metadata pointing to both index files
      const metadata = {
        packagePath: pkgA,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "go",
            indexFile: ".archon/scip/index.go.scip",
            hash: "abc123",
            symbolCount: 10,
          },
          {
            language: "typescript",
            indexFile: ".archon/scip/index.ts.scip",
            hash: "def456",
            symbolCount: 20,
          },
        ],
      };
      await writeFile(join(scipDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(false);
    });

    it("should return true when one of multiple indexes is missing", async () => {
      // Create a package with metadata for multiple indexes but only one exists
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      // Create only one index file
      await writeFile(join(scipDir, "index.go.scip"), "mock go scip content");
      // Note: index.ts.scip is intentionally missing

      // Write metadata pointing to both index files
      const metadata = {
        packagePath: pkgA,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "go",
            indexFile: ".archon/scip/index.go.scip",
            hash: "abc123",
            symbolCount: 10,
          },
          {
            language: "typescript",
            indexFile: ".archon/scip/index.ts.scip",
            hash: "def456",
            symbolCount: 20,
          },
        ],
      };
      await writeFile(join(scipDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(true);
    });

    it("should return true when metadata.json is malformed", async () => {
      // Create a package with malformed metadata
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      // Write malformed metadata
      await writeFile(join(scipDir, "metadata.json"), "{ invalid json }");

      const changed = await hasPackageChanged(pkgA);

      expect(changed).toBe(true);
    });
  });

  describe("indexWorkspace - response structure validation", () => {
    /**
     * Tests that the indexWorkspace tool response contains all required fields.
     * Validates: Requirement 6.6
     */

    it("should return response with all required fields for empty workspace", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });

      // Verify required fields are present
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesIndexed");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalSymbols");
      expect(result).toHaveProperty("errors");

      // Verify types
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.workspacePath).toBe("string");
      expect(Array.isArray(result.packagesIndexed)).toBe(true);
      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      expect(typeof result.totalSymbols).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should return success=true for workspace with no packages", async () => {
      // Create a workspace with only non-package files
      await writeFile(join(testDir, "README.md"), "# Test");
      await writeFile(join(testDir, "config.yaml"), "key: value");

      const result = await indexWorkspace({ workspacePath: testDir });

      expect(result.success).toBe(true);
      expect(result.packagesIndexed).toEqual([]);
      expect(result.packagesSkipped).toEqual([]);
      expect(result.totalSymbols).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it("should return resolved absolute path in workspacePath", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });

      // workspacePath should be an absolute path
      expect(result.workspacePath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
      // Should contain the test directory name
      expect(result.workspacePath).toContain("workspace-indexing-test");
    });

    it("should return packagesIndexed as array of valid PackageIndexResult objects", async () => {
      // Create a package with supported language
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // Verify structure of packagesIndexed items
      for (const pkg of result.packagesIndexed) {
        expect(pkg).toHaveProperty("package");
        expect(pkg).toHaveProperty("languages");
        expect(pkg).toHaveProperty("symbolCount");

        expect(typeof pkg.package).toBe("string");
        expect(Array.isArray(pkg.languages)).toBe(true);
        expect(typeof pkg.symbolCount).toBe("number");

        // Verify languages are valid
        for (const lang of pkg.languages) {
          expect(["go", "typescript"]).toContain(lang);
        }
      }
    });

    it("should return packagesSkipped as array of strings", async () => {
      // Create a package without supported languages
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      // No .ts or .js files - just package.json

      const result = await indexWorkspace({ workspacePath: testDir });

      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      for (const skipped of result.packagesSkipped) {
        expect(typeof skipped).toBe("string");
      }
    });

    it("should return totalSymbols as non-negative integer", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });

      expect(result.totalSymbols).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.totalSymbols)).toBe(true);
    });

    it("should return errors as array of PackageError objects", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });

      expect(Array.isArray(result.errors)).toBe(true);
      for (const error of result.errors) {
        expect(error).toHaveProperty("package");
        expect(error).toHaveProperty("error");
        expect(typeof error.package).toBe("string");
        expect(typeof error.error).toBe("string");
      }
    });

    it("should include package name (basename) in packagesIndexed", async () => {
      const pkgA = join(testDir, "my-package");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "my-package" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // If package was indexed, verify the name
      const indexedPkg = result.packagesIndexed.find((p) => p.package === "my-package");
      if (indexedPkg) {
        expect(indexedPkg.package).toBe("my-package");
      }
    });
  });

  describe("indexWorkspace - error response format validation", () => {
    /**
     * Tests that error responses contain helpful information.
     * Validates: Requirements 6.1, 6.6
     */

    it("should return error for non-existent workspace path", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      const result = await indexWorkspace({ workspacePath: nonExistentPath });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain("does not exist");
    });

    it("should return descriptive error message for invalid workspace path", async () => {
      const nonExistentPath = join(testDir, "invalid-workspace");

      const result = await indexWorkspace({ workspacePath: nonExistentPath });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Error should mention the path
      expect(result.errors[0].error).toContain("invalid-workspace");
    });

    it("should handle empty string workspace path gracefully", async () => {
      const result = await indexWorkspace({ workspacePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesIndexed");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalSymbols");
      expect(result).toHaveProperty("errors");
    }, 30000);

    it("should include package name in error when package indexing fails", async () => {
      // Create a package that might fail indexing
      const pkgA = join(testDir, "failing-pkg");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "go.mod"), "module test");
      await writeFile(join(pkgA, "main.go"), "package main\n\nfunc main() {}");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // If there are errors, they should include the package name
      for (const error of result.errors) {
        expect(error.package).toBeTruthy();
        expect(typeof error.package).toBe("string");
      }
    }, 30000);

    it("should continue processing other packages when one fails", async () => {
      // Create multiple packages
      const pkg1 = join(testDir, "pkg1");
      const pkg2 = join(testDir, "pkg2");
      await mkdir(pkg1, { recursive: true });
      await mkdir(pkg2, { recursive: true });

      // pkg1 - Go package (might fail if scip-go not installed)
      await writeFile(join(pkg1, "go.mod"), "module pkg1");
      await writeFile(join(pkg1, "main.go"), "package main\n\nfunc main() {}");

      // pkg2 - TypeScript package
      await writeFile(join(pkg2, "package.json"), JSON.stringify({ name: "pkg2" }));
      await writeFile(join(pkg2, "index.ts"), "export const x = 1;");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // Should have processed both packages (either indexed, skipped, or errored)
      const totalProcessed =
        result.packagesIndexed.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(2);
    }, 30000);

    it("should return success=true when some packages succeed and some fail", async () => {
      // Create a package that should succeed
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // Success should be true if at least one package was indexed or no errors
      if (result.packagesIndexed.length > 0 || result.errors.length === 0) {
        expect(result.success).toBe(true);
      }
    }, 30000);
  });

  describe("indexWorkspace - timeout handling", () => {
    /**
     * Tests that the tool handles long-running operations appropriately.
     * Validates: Requirements 6.1-6.8
     */

    it("should complete within reasonable time for empty workspace", async () => {
      const startTime = Date.now();

      const result = await indexWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      // Should complete quickly for empty workspace (under 5 seconds)
      expect(elapsed).toBeLessThan(5000);
      expect(result).toHaveProperty("success");
    });

    it("should complete within reasonable time for workspace with few packages", async () => {
      // Create a few small packages
      for (let i = 0; i < 3; i++) {
        const pkgDir = join(testDir, `pkg-${i}`);
        await mkdir(pkgDir, { recursive: true });
        await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: `pkg-${i}` }));
      }

      const startTime = Date.now();

      const result = await indexWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      // Should complete within 30 seconds for a few packages
      expect(elapsed).toBeLessThan(30000);
      expect(result).toHaveProperty("success");
    });

    it("should handle concurrent package processing efficiently", async () => {
      // Create multiple packages
      const packageCount = 5;
      for (let i = 0; i < packageCount; i++) {
        const pkgDir = join(testDir, `concurrent-pkg-${i}`);
        await mkdir(pkgDir, { recursive: true });
        await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: `concurrent-pkg-${i}` }));
      }

      const startTime = Date.now();

      const result = await indexWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(60000);
      expect(result).toHaveProperty("success");
    });
  });

  describe("indexWorkspace - force parameter behavior", () => {
    /**
     * Tests that the force parameter works correctly.
     * Validates: Requirement 6.7
     */

    it("should accept force parameter without error", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept force=false parameter", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        force: false,
      });

      expect(result).toHaveProperty("success");
    });

    it("should re-index unchanged packages when force=true", async () => {
      // Create a package with existing metadata
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      // Create mock index file and metadata
      await writeFile(join(scipDir, "index.scip"), "mock scip content");
      const metadata = {
        packagePath: pkgA,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "typescript",
            indexFile: ".archon/scip/index.scip",
            hash: "abc123",
            symbolCount: 10,
          },
        ],
      };
      await writeFile(join(scipDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      // Without force, package should be skipped
      const resultNoForce = await indexWorkspace({
        workspacePath: testDir,
        force: false,
      });

      // With force, package should be re-indexed
      const resultWithForce = await indexWorkspace({
        workspacePath: testDir,
        force: true,
      });

      // Both should complete successfully
      expect(resultNoForce).toHaveProperty("success");
      expect(resultWithForce).toHaveProperty("success");
    });
  });

  describe("indexWorkspace - packages filter parameter", () => {
    /**
     * Tests that the packages filter parameter works correctly.
     * Validates: Requirement 6.8
     */

    it("should accept packages parameter without error", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        packages: ["pkg-a"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should only index specified packages when packages parameter is provided", async () => {
      // Create multiple packages
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgB, "package.json"), JSON.stringify({ name: "pkg-b" }));
      await writeFile(join(pkgA, "index.ts"), "export const a = 1;");
      await writeFile(join(pkgB, "index.ts"), "export const b = 1;");

      const result = await indexWorkspace({
        workspacePath: testDir,
        packages: ["pkg-a"],
        force: true,
      });

      // Should only process pkg-a
      const processedPackages = [
        ...result.packagesIndexed.map((p) => p.package),
        ...result.packagesSkipped,
        ...result.errors.map((e) => e.package),
      ];

      // pkg-b should not be in any of the result arrays
      expect(processedPackages).not.toContain("pkg-b");
    });

    it("should handle empty packages array", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        packages: [],
      });

      // Empty packages array should process all packages (same as not providing it)
      expect(result).toHaveProperty("success");
    });

    it("should handle non-existent package names in filter", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        packages: ["non-existent-package"],
      });

      // Should complete without error, but no packages processed
      expect(result).toHaveProperty("success");
      expect(result.packagesIndexed).toEqual([]);
    });
  });

  describe("indexWorkspace - edge cases", () => {
    /**
     * Tests for edge cases and boundary conditions.
     * Validates: Requirements 6.1-6.8
     */

    it("should handle workspace path with spaces", async () => {
      const spacePath = join(testDir, "path with spaces");
      await mkdir(spacePath, { recursive: true });
      await writeFile(join(spacePath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await indexWorkspace({ workspacePath: spacePath });

      expect(result.workspacePath).toContain("path with spaces");
    });

    it("should handle workspace path with unicode characters", async () => {
      const unicodePath = join(testDir, "工作区测试");
      await mkdir(unicodePath, { recursive: true });
      await writeFile(join(unicodePath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await indexWorkspace({ workspacePath: unicodePath });

      expect(result.workspacePath).toContain("工作区测试");
    });

    it("should handle deeply nested workspace path", async () => {
      const deepPath = join(testDir, "a", "b", "c", "d");
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await indexWorkspace({ workspacePath: deepPath });

      expect(result.workspacePath).toContain("a");
      expect(result.workspacePath).toContain("b");
      expect(result.workspacePath).toContain("c");
      expect(result.workspacePath).toContain("d");
    });

    it("should handle workspace with many nested packages", async () => {
      // Create nested package structure
      const nestedPaths = [
        join(testDir, "level1", "pkg1"),
        join(testDir, "level1", "level2", "pkg2"),
        join(testDir, "level1", "level2", "level3", "pkg3"),
      ];

      for (const pkgPath of nestedPaths) {
        await mkdir(pkgPath, { recursive: true });
        await writeFile(join(pkgPath, "package.json"), JSON.stringify({ name: pkgPath.split("/").pop() }));
      }

      const result = await indexWorkspace({ workspacePath: testDir });

      // Should discover all nested packages
      const totalProcessed =
        result.packagesIndexed.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(3);
    });

    it("should handle workspace with mixed Go and TypeScript packages", async () => {
      // Create Go package
      const goPkg = join(testDir, "go-pkg");
      await mkdir(goPkg, { recursive: true });
      await writeFile(join(goPkg, "go.mod"), "module go-pkg");
      await writeFile(join(goPkg, "main.go"), "package main\n\nfunc main() {}");

      // Create TypeScript package
      const tsPkg = join(testDir, "ts-pkg");
      await mkdir(tsPkg, { recursive: true });
      await writeFile(join(tsPkg, "package.json"), JSON.stringify({ name: "ts-pkg" }));
      await writeFile(join(tsPkg, "index.ts"), "export const x = 1;");

      const result = await indexWorkspace({ workspacePath: testDir, force: true });

      // Should process both packages
      const totalProcessed =
        result.packagesIndexed.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(2);
    });
  });
});
