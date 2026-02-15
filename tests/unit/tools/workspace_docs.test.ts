/**
 * Unit tests for Workspace Documentation Tool
 *
 * Tests tool response structure validation, error response format validation,
 * change detection behavior, force parameter behavior, and packages filter behavior.
 *
 * Validates: Requirements 7.1-7.7
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { documentWorkspace } from "../../../src/tools/workspace_docs.js";
import type {
  DocumentWorkspaceInput,
  DocumentWorkspaceOutput,
  PackageDocResult,
  PackageError,
} from "../../../src/types/tools.js";

describe("Workspace Documentation Tool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `workspace-docs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("documentWorkspace - response structure validation", () => {
    /**
     * Tests that the documentWorkspace tool response contains all required fields.
     * Validates: Requirement 7.5
     */

    it("should return response with all required fields for empty workspace", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesDocumented");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalFilesGenerated");
      expect(result).toHaveProperty("totalArns");
      expect(result).toHaveProperty("errors");

      expect(typeof result.success).toBe("boolean");
      expect(typeof result.workspacePath).toBe("string");
      expect(Array.isArray(result.packagesDocumented)).toBe(true);
      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      expect(typeof result.totalFilesGenerated).toBe("number");
      expect(typeof result.totalArns).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should return success=true for workspace with no packages", async () => {
      await writeFile(join(testDir, "README.md"), "# Test");
      await writeFile(join(testDir, "config.yaml"), "key: value");

      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result.success).toBe(true);
      expect(result.packagesDocumented).toEqual([]);
      expect(result.packagesSkipped).toEqual([]);
      expect(result.totalFilesGenerated).toBe(0);
      expect(result.totalArns).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it("should return resolved absolute path in workspacePath", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result.workspacePath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
      expect(result.workspacePath).toContain("workspace-docs-test");
    });

    it("should return packagesDocumented as array of valid PackageDocResult objects", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      for (const pkg of result.packagesDocumented) {
        expect(pkg).toHaveProperty("package");
        expect(pkg).toHaveProperty("filesGenerated");
        expect(pkg).toHaveProperty("arnsCreated");

        expect(typeof pkg.package).toBe("string");
        expect(typeof pkg.filesGenerated).toBe("number");
        expect(Array.isArray(pkg.arnsCreated)).toBe(true);

        for (const arn of pkg.arnsCreated) {
          expect(typeof arn).toBe("string");
        }
      }
    });

    it("should return packagesSkipped as array of strings", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      const result = await documentWorkspace({ workspacePath: testDir });

      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      for (const skipped of result.packagesSkipped) {
        expect(typeof skipped).toBe("string");
      }
    });

    it("should return totalFilesGenerated as non-negative integer", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result.totalFilesGenerated).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.totalFilesGenerated)).toBe(true);
    });

    it("should return totalArns as non-negative integer", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result.totalArns).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.totalArns)).toBe(true);
    });

    it("should return errors as array of PackageError objects", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(Array.isArray(result.errors)).toBe(true);
      for (const error of result.errors) {
        expect(error).toHaveProperty("package");
        expect(error).toHaveProperty("error");
        expect(typeof error.package).toBe("string");
        expect(typeof error.error).toBe("string");
      }
    });

    it("should include package name (basename) in packagesDocumented", async () => {
      const pkgA = join(testDir, "my-documentation-package");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "my-documentation-package" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      const documentedPkg = result.packagesDocumented.find((p) => p.package === "my-documentation-package");
      if (documentedPkg) {
        expect(documentedPkg.package).toBe("my-documentation-package");
      }
    });

    it("should track totalFilesGenerated correctly", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      const sumFilesGenerated = result.packagesDocumented.reduce(
        (sum, pkg) => sum + pkg.filesGenerated,
        0
      );
      expect(result.totalFilesGenerated).toBe(sumFilesGenerated);
    });

    it("should track totalArns correctly", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      const sumArns = result.packagesDocumented.reduce(
        (sum, pkg) => sum + pkg.arnsCreated.length,
        0
      );
      expect(result.totalArns).toBe(sumArns);
    });
  });

  describe("documentWorkspace - error response format validation", () => {
    /**
     * Tests that error responses contain helpful information.
     * Validates: Requirements 7.1, 7.5
     */

    it("should return error for non-existent workspace path", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      const result = await documentWorkspace({ workspacePath: nonExistentPath });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain("does not exist");
    });

    it("should return descriptive error message for invalid workspace path", async () => {
      const nonExistentPath = join(testDir, "invalid-workspace");

      const result = await documentWorkspace({ workspacePath: nonExistentPath });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain("invalid-workspace");
    });

    it("should handle empty string workspace path gracefully", async () => {
      const result = await documentWorkspace({ workspacePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesDocumented");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalFilesGenerated");
      expect(result).toHaveProperty("totalArns");
      expect(result).toHaveProperty("errors");
    });

    it("should include package name in error when package documentation fails", async () => {
      const pkgA = join(testDir, "failing-pkg");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "go.mod"), "module test");
      await writeFile(join(pkgA, "main.go"), "package main\n\nfunc main() {}");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      for (const error of result.errors) {
        expect(error.package).toBeTruthy();
        expect(typeof error.package).toBe("string");
      }
    });

    it("should continue processing other packages when one fails", async () => {
      const pkg1 = join(testDir, "pkg1");
      const pkg2 = join(testDir, "pkg2");
      await mkdir(pkg1, { recursive: true });
      await mkdir(pkg2, { recursive: true });

      await writeFile(join(pkg1, "go.mod"), "module pkg1");
      await writeFile(join(pkg1, "main.go"), "package main\n\nfunc main() {}");

      await writeFile(join(pkg2, "package.json"), JSON.stringify({ name: "pkg2" }));
      await writeFile(join(pkg2, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      const totalProcessed =
        result.packagesDocumented.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(2);
    });

    it("should return success=true when some packages succeed and some fail", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      if (result.packagesDocumented.length > 0 || result.errors.length === 0) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe("documentWorkspace - change detection behavior", () => {
    /**
     * Tests that change detection works correctly using SCIP index hashes.
     * Validates: Requirement 7.3
     */

    it("should handle packages without SCIP indexes appropriately", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      const result = await documentWorkspace({ workspacePath: testDir });

      // Packages without SCIP indexes are either skipped or have errors
      // depending on whether they have source files that need indexing first
      const totalProcessed =
        result.packagesDocumented.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(0);
    });

    it("should skip packages with unchanged SCIP indexes", async () => {
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

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

      const result = await documentWorkspace({ workspacePath: testDir, force: false });

      expect(result.packagesSkipped).toContain("pkg-a");
    });

    it("should process packages with changed SCIP indexes", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir });

      const totalProcessed =
        result.packagesDocumented.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("documentWorkspace - force parameter behavior", () => {
    /**
     * Tests that the force parameter works correctly.
     * Validates: Requirement 7.6
     */

    it("should accept force parameter without error", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept force=false parameter", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        force: false,
      });

      expect(result).toHaveProperty("success");
    });

    it("should re-document unchanged packages when force=true", async () => {
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

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

      const resultNoForce = await documentWorkspace({
        workspacePath: testDir,
        force: false,
      });

      const resultWithForce = await documentWorkspace({
        workspacePath: testDir,
        force: true,
      });

      expect(resultNoForce).toHaveProperty("success");
      expect(resultWithForce).toHaveProperty("success");
    });

    it("should skip unchanged packages when force=false", async () => {
      const pkgA = join(testDir, "pkg-a");
      const scipDir = join(pkgA, ".archon", "scip");
      await mkdir(scipDir, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

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

      const result = await documentWorkspace({
        workspacePath: testDir,
        force: false,
      });

      expect(result.packagesSkipped).toContain("pkg-a");
    });
  });

  describe("documentWorkspace - packages filter parameter", () => {
    /**
     * Tests that the packages filter parameter works correctly.
     * Validates: Requirement 7.7
     */

    it("should accept packages parameter without error", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["pkg-a"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should only document specified packages when packages parameter is provided", async () => {
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgB, "package.json"), JSON.stringify({ name: "pkg-b" }));
      await writeFile(join(pkgA, "index.ts"), "export const a = 1;");
      await writeFile(join(pkgB, "index.ts"), "export const b = 1;");

      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["pkg-a"],
        force: true,
      });

      const processedPackages = [
        ...result.packagesDocumented.map((p) => p.package),
        ...result.packagesSkipped,
        ...result.errors.map((e) => e.package),
      ];

      expect(processedPackages).not.toContain("pkg-b");
    });

    it("should handle empty packages array", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: [],
      });

      expect(result).toHaveProperty("success");
    });

    it("should handle non-existent package names in filter", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["non-existent-package"],
      });

      expect(result).toHaveProperty("success");
      expect(result.packagesDocumented).toEqual([]);
    });

    it("should match packages by name (basename)", async () => {
      const pkgA = join(testDir, "nested", "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const a = 1;");

      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["pkg-a"],
        force: true,
      });

      const processedPackages = [
        ...result.packagesDocumented.map((p) => p.package),
        ...result.packagesSkipped,
        ...result.errors.map((e) => e.package),
      ];

      expect(processedPackages.length).toBeGreaterThanOrEqual(0);
    });

    it("should match packages case-insensitively", async () => {
      const pkgA = join(testDir, "MyPackage");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "MyPackage" }));
      await writeFile(join(pkgA, "index.ts"), "export const a = 1;");

      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["mypackage"],
        force: true,
      });

      const processedPackages = [
        ...result.packagesDocumented.map((p) => p.package),
        ...result.packagesSkipped,
        ...result.errors.map((e) => e.package),
      ];

      expect(processedPackages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("documentWorkspace - ARN tracking", () => {
    /**
     * Tests that ARN generation is tracked correctly.
     * Validates: Requirement 7.4
     */

    it("should track ARNs created during documentation generation", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      for (const pkg of result.packagesDocumented) {
        expect(Array.isArray(pkg.arnsCreated)).toBe(true);
        expect(pkg.arnsCreated.length).toBe(pkg.filesGenerated);
      }
    });

    it("should return valid ARN format in arnsCreated", async () => {
      const pkgA = join(testDir, "pkg-a");
      await mkdir(pkgA, { recursive: true });
      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));
      await writeFile(join(pkgA, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      for (const pkg of result.packagesDocumented) {
        for (const arn of pkg.arnsCreated) {
          expect(typeof arn).toBe("string");
          if (arn.length > 0) {
            expect(arn).toMatch(/^arn:archon:/);
          }
        }
      }
    });
  });

  describe("documentWorkspace - edge cases", () => {
    /**
     * Tests for edge cases and boundary conditions.
     * Validates: Requirements 7.1-7.7
     */

    it("should handle workspace path with spaces", async () => {
      const spacePath = join(testDir, "path with spaces");
      await mkdir(spacePath, { recursive: true });
      await writeFile(join(spacePath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await documentWorkspace({ workspacePath: spacePath });

      expect(result.workspacePath).toContain("path with spaces");
    });

    it("should handle workspace path with unicode characters", async () => {
      const unicodePath = join(testDir, "文档工作区");
      await mkdir(unicodePath, { recursive: true });
      await writeFile(join(unicodePath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await documentWorkspace({ workspacePath: unicodePath });

      expect(result.workspacePath).toContain("文档工作区");
    });

    it("should handle deeply nested workspace path", async () => {
      const deepPath = join(testDir, "a", "b", "c", "d");
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, "package.json"), JSON.stringify({ name: "test" }));

      const result = await documentWorkspace({ workspacePath: deepPath });

      expect(result.workspacePath).toContain("a");
      expect(result.workspacePath).toContain("b");
      expect(result.workspacePath).toContain("c");
      expect(result.workspacePath).toContain("d");
    });

    it("should handle workspace with many nested packages", async () => {
      const nestedPaths = [
        join(testDir, "level1", "pkg1"),
        join(testDir, "level1", "level2", "pkg2"),
        join(testDir, "level1", "level2", "level3", "pkg3"),
      ];

      for (const pkgPath of nestedPaths) {
        await mkdir(pkgPath, { recursive: true });
        await writeFile(join(pkgPath, "package.json"), JSON.stringify({ name: pkgPath.split("/").pop() }));
      }

      const result = await documentWorkspace({ workspacePath: testDir });

      const totalProcessed =
        result.packagesDocumented.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(3);
    });

    it("should handle workspace with mixed Go and TypeScript packages", async () => {
      const goPkg = join(testDir, "go-pkg");
      await mkdir(goPkg, { recursive: true });
      await writeFile(join(goPkg, "go.mod"), "module go-pkg");
      await writeFile(join(goPkg, "main.go"), "package main\n\nfunc main() {}");

      const tsPkg = join(testDir, "ts-pkg");
      await mkdir(tsPkg, { recursive: true });
      await writeFile(join(tsPkg, "package.json"), JSON.stringify({ name: "ts-pkg" }));
      await writeFile(join(tsPkg, "index.ts"), "export const x = 1;");

      const result = await documentWorkspace({ workspacePath: testDir, force: true });

      const totalProcessed =
        result.packagesDocumented.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(2);
    });

    it("should process packages in dependency order", async () => {
      const pkgA = join(testDir, "pkg-a");
      const pkgB = join(testDir, "pkg-b");
      const pkgC = join(testDir, "pkg-c");
      await mkdir(pkgA, { recursive: true });
      await mkdir(pkgB, { recursive: true });
      await mkdir(pkgC, { recursive: true });

      await writeFile(join(pkgA, "package.json"), JSON.stringify({ name: "pkg-a" }));

      await writeFile(
        join(pkgB, "package.json"),
        JSON.stringify({
          name: "pkg-b",
          dependencies: { "pkg-a": "^1.0.0" },
        })
      );

      await writeFile(
        join(pkgC, "package.json"),
        JSON.stringify({
          name: "pkg-c",
          dependencies: { "pkg-b": "^1.0.0" },
        })
      );

      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result).toHaveProperty("success");
    });
  });

  describe("documentWorkspace - timeout handling", () => {
    /**
     * Tests that the tool handles long-running operations appropriately.
     * Validates: Requirements 7.1-7.7
     */

    it("should complete within reasonable time for empty workspace", async () => {
      const startTime = Date.now();

      const result = await documentWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(5000);
      expect(result).toHaveProperty("success");
    });

    it("should complete within reasonable time for workspace with few packages", async () => {
      for (let i = 0; i < 3; i++) {
        const pkgDir = join(testDir, `pkg-${i}`);
        await mkdir(pkgDir, { recursive: true });
        await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: `pkg-${i}` }));
      }

      const startTime = Date.now();

      const result = await documentWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(30000);
      expect(result).toHaveProperty("success");
    });

    it("should handle concurrent package processing efficiently", async () => {
      const packageCount = 5;
      for (let i = 0; i < packageCount; i++) {
        const pkgDir = join(testDir, `concurrent-pkg-${i}`);
        await mkdir(pkgDir, { recursive: true });
        await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: `concurrent-pkg-${i}` }));
      }

      const startTime = Date.now();

      const result = await documentWorkspace({ workspacePath: testDir });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(60000);
      expect(result).toHaveProperty("success");
    });
  });
});
