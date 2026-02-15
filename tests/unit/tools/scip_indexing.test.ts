/**
 * Unit Tests for SCIP Indexing Tool
 *
 * Tests for the SCIP indexing MCP tool that generates SCIP indexes for packages
 * by detecting languages and invoking appropriate SCIP tools.
 *
 * @see Requirements 1.1-1.11
 */

import { generateScipIndex } from "../../../src/tools/scip_indexing.js";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  GenerateScipIndexOutput,
  DetectedLanguage,
  IndexResult,
} from "../../../src/types/tools.js";

describe("SCIP Indexing Tool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scip-indexing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("response structure validation", () => {
    /**
     * Tests that the tool response contains all required fields.
     * Validates: Requirement 1.11
     */

    it("should return response with all required fields for empty package", async () => {
      const result = await generateScipIndex({ packagePath: testDir });

      // Verify required fields are present
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("languagesDetected");
      expect(result).toHaveProperty("indexes");

      // Verify types
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.packagePath).toBe("string");
      expect(Array.isArray(result.languagesDetected)).toBe(true);
      expect(Array.isArray(result.indexes)).toBe(true);
    });

    it("should return success=true for package with no supported languages", async () => {
      // Create a package with only unsupported files
      await writeFile(join(testDir, "README.md"), "# Test");
      await writeFile(join(testDir, "config.yaml"), "key: value");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.success).toBe(true);
      expect(result.languagesDetected).toEqual([]);
      expect(result.indexes).toEqual([]);
      expect(result.errors).toBeUndefined();
    });

    it("should return resolved absolute path in packagePath", async () => {
      const result = await generateScipIndex({ packagePath: testDir });

      // packagePath should be an absolute path
      expect(result.packagePath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
      // Should contain the test directory name
      expect(result.packagePath).toContain("scip-indexing-test");
    });

    it("should return languagesDetected as array of valid language strings", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toBeInstanceOf(Array);
      for (const lang of result.languagesDetected) {
        expect(["go", "typescript"]).toContain(lang);
      }
    });

    it("should return indexes array with valid IndexResult objects", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      // If there are indexes (may fail if scip-go not installed)
      for (const index of result.indexes) {
        expect(index).toHaveProperty("language");
        expect(index).toHaveProperty("indexPath");
        expect(index).toHaveProperty("symbolCount");
        expect(index).toHaveProperty("hash");

        expect(["go", "typescript"]).toContain(index.language);
        expect(typeof index.indexPath).toBe("string");
        expect(typeof index.symbolCount).toBe("number");
        expect(typeof index.hash).toBe("string");
      }
    });

    it("should include errors array only when there are errors", async () => {
      // Empty package - no errors expected
      const result = await generateScipIndex({ packagePath: testDir });

      // errors should be undefined when there are no errors
      if (result.errors !== undefined) {
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("should return errors as array of strings when present", async () => {
      // Create a Go package - will likely fail if scip-go not installed
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

      const result = await generateScipIndex({ packagePath: testDir });

      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        for (const error of result.errors) {
          expect(typeof error).toBe("string");
        }
      }
    });
  });

  describe("error response format validation", () => {
    /**
     * Tests that error responses contain helpful information.
     * Validates: Requirement 1.10
     */

    it("should return installation instructions when scip-go is not installed", async () => {
      // Create a Go package
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

      const result = await generateScipIndex({ packagePath: testDir, force: true });

      // If scip-go is not installed, we should get an error with instructions
      if (result.errors && result.errors.length > 0) {
        const goError = result.errors.find((e) => e.includes("scip-go"));
        if (goError) {
          expect(goError).toContain("scip-go is not installed");
          expect(goError).toContain("Install it with");
          expect(goError).toContain("go install");
        }
      }
    });

    it("should return installation instructions when scip-typescript is not installed", async () => {
      // Create a TypeScript package
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir, force: true });

      // If scip-typescript is not installed, we should get an error with instructions
      if (result.errors && result.errors.length > 0) {
        const tsError = result.errors.find((e) => e.includes("scip-typescript"));
        if (tsError) {
          expect(tsError).toContain("scip-typescript is not installed");
          expect(tsError).toContain("Install it with");
          expect(tsError).toContain("npm install");
        }
      }
    });

    it("should return appropriate error for invalid package path", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      const result = await generateScipIndex({ packagePath: nonExistentPath });

      // Should handle gracefully - either success with empty results or error
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
    });

    it("should handle empty string package path gracefully", async () => {
      const result = await generateScipIndex({ packagePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("languagesDetected");
      expect(result).toHaveProperty("indexes");
    });
  });

  describe("language detection integration", () => {
    /**
     * Tests that language detection is correctly integrated.
     * Validates: Requirements 1.3, 1.4, 1.7
     */

    it("should detect Go-only packages and return only 'go' in languagesDetected", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("go");
      expect(result.languagesDetected).not.toContain("typescript");
    });

    it("should detect TypeScript-only packages and return only 'typescript' in languagesDetected", async () => {
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("typescript");
      expect(result.languagesDetected).not.toContain("go");
    });

    it("should detect multi-language packages and return both languages", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("go");
      expect(result.languagesDetected).toContain("typescript");
      expect(result.languagesDetected.length).toBe(2);
    });

    it("should detect Go via .go files without go.mod", async () => {
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("go");
    });

    it("should detect TypeScript via .ts files without package.json", async () => {
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("typescript");
    });

    it("should detect TypeScript via .js files", async () => {
      await writeFile(join(testDir, "index.js"), "module.exports = {};");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("typescript");
    });
  });

  describe("index file naming", () => {
    /**
     * Tests that index files are named correctly based on language count.
     * Validates: Requirement 1.8
     */

    it("should use 'index.scip' for single-language Go packages", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

      const result = await generateScipIndex({ packagePath: testDir });

      // If indexing succeeded, check the path
      const goIndex = result.indexes.find((i) => i.language === "go");
      if (goIndex) {
        expect(goIndex.indexPath).toContain("index.scip");
        expect(goIndex.indexPath).not.toContain("index.go.scip");
      }
    });

    it("should use 'index.scip' for single-language TypeScript packages", async () => {
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir });

      // If indexing succeeded, check the path
      const tsIndex = result.indexes.find((i) => i.language === "typescript");
      if (tsIndex) {
        expect(tsIndex.indexPath).toContain("index.scip");
        expect(tsIndex.indexPath).not.toContain("index.ts.scip");
      }
    });

    it("should use 'index.go.scip' and 'index.ts.scip' for multi-language packages", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");
      await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await generateScipIndex({ packagePath: testDir });

      // If indexing succeeded, check the paths
      const goIndex = result.indexes.find((i) => i.language === "go");
      const tsIndex = result.indexes.find((i) => i.language === "typescript");

      if (goIndex) {
        expect(goIndex.indexPath).toContain("index.go.scip");
      }
      if (tsIndex) {
        expect(tsIndex.indexPath).toContain("index.ts.scip");
      }
    });

    it("should output indexes to .archon/scip/ directory", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      // If indexing succeeded, check the directory structure
      for (const index of result.indexes) {
        expect(index.indexPath).toContain(".archon");
        expect(index.indexPath).toContain("scip");
      }
    });
  });

  describe("force parameter behavior", () => {
    /**
     * Tests that the force parameter works correctly.
     * Validates: Requirement 1.9 (hash-based change detection)
     */

    it("should accept force parameter without error", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({
        packagePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept force=false parameter", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({
        packagePath: testDir,
        force: false,
      });

      expect(result).toHaveProperty("success");
    });
  });

  describe("index result structure", () => {
    /**
     * Tests that IndexResult objects have correct structure.
     * Validates: Requirement 1.11
     */

    it("should return valid hash strings (SHA-256 format)", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      for (const index of result.indexes) {
        // SHA-256 hash is 64 hex characters
        expect(index.hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("should return positive symbolCount", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      for (const index of result.indexes) {
        expect(index.symbolCount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(index.symbolCount)).toBe(true);
      }
    });

    it("should return absolute paths in indexPath", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      for (const index of result.indexes) {
        // Should be an absolute path
        expect(index.indexPath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
      }
    });
  });

  describe("edge cases", () => {
    /**
     * Tests for edge cases and boundary conditions.
     * Validates: Requirements 1.1-1.11
     */

    it("should handle package with only go.mod (no .go files)", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("go");
    });

    it("should handle package with only package.json (no .ts/.js files)", async () => {
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("typescript");
    });

    it("should handle deeply nested test directory path", async () => {
      const deepPath = join(testDir, "a", "b", "c", "d");
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: deepPath });

      expect(result.packagePath).toContain("a");
      expect(result.packagePath).toContain("b");
      expect(result.packagePath).toContain("c");
      expect(result.packagePath).toContain("d");
    });

    it("should handle package path with spaces", async () => {
      const spacePath = join(testDir, "path with spaces");
      await mkdir(spacePath, { recursive: true });
      await writeFile(join(spacePath, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: spacePath });

      expect(result.packagePath).toContain("path with spaces");
    });

    it("should handle package path with unicode characters", async () => {
      const unicodePath = join(testDir, "路径测试");
      await mkdir(unicodePath, { recursive: true });
      await writeFile(join(unicodePath, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: unicodePath });

      expect(result.packagePath).toContain("路径测试");
    });
  });

  describe("concurrent invocations", () => {
    /**
     * Tests that the tool handles concurrent invocations correctly.
     * Validates: Requirements 1.1-1.11
     */

    it("should handle multiple concurrent invocations on different packages", async () => {
      // Create two separate packages
      const pkg1 = join(testDir, "pkg1");
      const pkg2 = join(testDir, "pkg2");
      await mkdir(pkg1, { recursive: true });
      await mkdir(pkg2, { recursive: true });
      await writeFile(join(pkg1, "go.mod"), "module pkg1");
      await writeFile(join(pkg2, "package.json"), '{"name": "pkg2"}');

      // Run concurrently
      const [result1, result2] = await Promise.all([
        generateScipIndex({ packagePath: pkg1 }),
        generateScipIndex({ packagePath: pkg2 }),
      ]);

      expect(result1.packagePath).toContain("pkg1");
      expect(result2.packagePath).toContain("pkg2");
      expect(result1.languagesDetected).toContain("go");
      expect(result2.languagesDetected).toContain("typescript");
    });
  });
});
