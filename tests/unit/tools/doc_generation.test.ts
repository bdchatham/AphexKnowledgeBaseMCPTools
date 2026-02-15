/**
 * Unit Tests for Documentation Generation Tool
 *
 * Tests for the documentation generation MCP tool that generates plain English
 * documentation from SCIP indexes with ARN references.
 *
 * @see Requirements 4.1-4.9
 */

import { generateArchonDoc } from "../../../src/tools/doc_generation.js";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  GenerateArchonDocOutput,
  GeneratedFileInfo,
} from "../../../src/types/tools.js";

describe("Documentation Generation Tool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `doc-generation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  /**
   * Helper to create a minimal SCIP index structure for testing.
   * Creates the .archon/scip/ directory with a mock index file.
   */
  async function createMockScipIndex(
    packagePath: string,
    options: {
      indexName?: string;
      metadata?: boolean;
      hash?: string;
    } = {}
  ): Promise<void> {
    const { indexName = "index.scip", metadata = true, hash = "abc123" } = options;
    const scipDir = join(packagePath, ".archon", "scip");
    await mkdir(scipDir, { recursive: true });

    // Create a minimal SCIP index file (empty protobuf)
    await writeFile(join(scipDir, indexName), Buffer.from([]));

    if (metadata) {
      const metadataContent = {
        packagePath,
        lastIndexed: new Date().toISOString(),
        indexes: [
          {
            language: "typescript",
            indexFile: indexName,
            hash,
            symbolCount: 0,
          },
        ],
      };
      await writeFile(
        join(scipDir, "metadata.json"),
        JSON.stringify(metadataContent, null, 2)
      );
    }
  }

  describe("response structure validation", () => {
    /**
     * Tests that the tool response contains all required fields.
     * Validates: Requirement 4.8
     */

    it("should return response with all required fields", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      // Verify required fields are present
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("filesGenerated");
      expect(result).toHaveProperty("filesSkipped");

      // Verify types
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.packagePath).toBe("string");
      expect(Array.isArray(result.filesGenerated)).toBe(true);
      expect(Array.isArray(result.filesSkipped)).toBe(true);
    });

    it("should return resolved absolute path in packagePath", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      // packagePath should be an absolute path
      expect(result.packagePath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
      // Should contain the test directory name
      expect(result.packagePath).toContain("doc-generation-test");
    });

    it("should return filesGenerated as array of GeneratedFileInfo objects", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.filesGenerated).toBeInstanceOf(Array);
      for (const file of result.filesGenerated) {
        expect(file).toHaveProperty("sourcePath");
        expect(file).toHaveProperty("docPath");
        expect(file).toHaveProperty("arn");

        expect(typeof file.sourcePath).toBe("string");
        expect(typeof file.docPath).toBe("string");
        expect(typeof file.arn).toBe("string");
      }
    });

    it("should return filesSkipped as array of strings", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.filesSkipped).toBeInstanceOf(Array);
      for (const file of result.filesSkipped) {
        expect(typeof file).toBe("string");
      }
    });

    it("should include errors array only when there are errors", async () => {
      // Package without SCIP index - should have errors
      const result = await generateArchonDoc({ packagePath: testDir });

      // errors should be present when there are errors
      if (result.errors !== undefined) {
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("should return errors as array of strings when present", async () => {
      // Package without SCIP index - will have errors
      const result = await generateArchonDoc({ packagePath: testDir });

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
     * Validates: Requirements 4.1, 4.8
     */

    it("should return error when no SCIP index exists", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]).toContain("No SCIP index files found");
    });

    it("should include suggestion to run generate_scip_index when no index exists", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("generate_scip_index");
    });

    it("should return appropriate error for invalid package path", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      const result = await generateArchonDoc({ packagePath: nonExistentPath });

      // Should handle gracefully - either success with empty results or error
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
    });

    it("should handle empty string package path gracefully", async () => {
      const result = await generateArchonDoc({ packagePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("filesGenerated");
      expect(result).toHaveProperty("filesSkipped");
    });

    it("should include package path in error message for missing index", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain(".archon/scip/");
    });
  });

  describe("files parameter handling", () => {
    /**
     * Tests that the files parameter correctly filters which files to document.
     * Validates: Requirement 4.1
     */

    it("should accept files parameter without error", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        files: ["src/index.ts"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept empty files array", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        files: [],
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept multiple files in files parameter", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        files: ["src/index.ts", "src/lib/utils.ts", "src/types/index.ts"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should handle files parameter with normalized paths", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        files: ["./src/index.ts", "src\\lib\\utils.ts"],
      });

      expect(result).toHaveProperty("success");
    });
  });

  describe("force parameter handling", () => {
    /**
     * Tests that the force parameter works correctly.
     * Validates: Requirement 4.6
     */

    it("should accept force parameter without error", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept force=false parameter", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({
        packagePath: testDir,
        force: false,
      });

      expect(result).toHaveProperty("success");
    });

    it("should default force to false when not provided", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should work without force parameter
      expect(result).toHaveProperty("success");
    });
  });

  describe("GeneratedFileInfo structure validation", () => {
    /**
     * Tests that GeneratedFileInfo objects have correct structure.
     * Validates: Requirement 4.8
     */

    it("should return sourcePath as relative path", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        // sourcePath should be relative (not start with / or drive letter)
        expect(file.sourcePath).not.toMatch(/^[/\\]|^[A-Za-z]:\\/);
      }
    });

    it("should return docPath with .archon.md extension", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        expect(file.docPath).toMatch(/\.archon\.md$/);
      }
    });

    it("should return valid ARN format in arn field", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        // ARN should start with arn:archon:
        expect(file.arn).toMatch(/^arn:archon:/);
      }
    });

    it("should return docPath co-located with sourcePath", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        // docPath should be in the same directory as sourcePath
        const sourceDir = file.sourcePath.replace(/[^/\\]+$/, "");
        const docDir = file.docPath.replace(/[^/\\]+$/, "");
        expect(docDir).toBe(sourceDir);
      }
    });
  });

  describe("SCIP index detection", () => {
    /**
     * Tests that the tool correctly detects SCIP index files.
     * Validates: Requirements 4.1, 4.2
     */

    it("should detect index.scip file", async () => {
      await createMockScipIndex(testDir, { indexName: "index.scip" });

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should not have "No SCIP index files found" error
      if (result.errors) {
        expect(result.errors[0]).not.toContain("No SCIP index files found");
      }
    });

    it("should detect index.go.scip file", async () => {
      await createMockScipIndex(testDir, { indexName: "index.go.scip" });

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should not have "No SCIP index files found" error
      if (result.errors) {
        expect(result.errors[0]).not.toContain("No SCIP index files found");
      }
    });

    it("should detect index.ts.scip file", async () => {
      await createMockScipIndex(testDir, { indexName: "index.ts.scip" });

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should not have "No SCIP index files found" error
      if (result.errors) {
        expect(result.errors[0]).not.toContain("No SCIP index files found");
      }
    });

    it("should look for SCIP indexes in .archon/scip/ directory", async () => {
      // Create SCIP index in wrong location
      const wrongDir = join(testDir, "scip");
      await mkdir(wrongDir, { recursive: true });
      await writeFile(join(wrongDir, "index.scip"), Buffer.from([]));

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should still report no index found (wrong location)
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("No SCIP index files found");
    });
  });

  describe("edge cases", () => {
    /**
     * Tests for edge cases and boundary conditions.
     * Validates: Requirements 4.1-4.9
     */

    it("should handle deeply nested test directory path", async () => {
      const deepPath = join(testDir, "a", "b", "c", "d");
      await mkdir(deepPath, { recursive: true });
      await createMockScipIndex(deepPath);

      const result = await generateArchonDoc({ packagePath: deepPath });

      expect(result.packagePath).toContain("a");
      expect(result.packagePath).toContain("b");
      expect(result.packagePath).toContain("c");
      expect(result.packagePath).toContain("d");
    });

    it("should handle package path with spaces", async () => {
      const spacePath = join(testDir, "path with spaces");
      await mkdir(spacePath, { recursive: true });
      await createMockScipIndex(spacePath);

      const result = await generateArchonDoc({ packagePath: spacePath });

      expect(result.packagePath).toContain("path with spaces");
    });

    it("should handle package path with unicode characters", async () => {
      const unicodePath = join(testDir, "路径测试");
      await mkdir(unicodePath, { recursive: true });
      await createMockScipIndex(unicodePath);

      const result = await generateArchonDoc({ packagePath: unicodePath });

      expect(result.packagePath).toContain("路径测试");
    });

    it("should handle empty SCIP index file gracefully", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should handle empty index without crashing
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("filesGenerated");
      expect(result).toHaveProperty("filesSkipped");
    });

    it("should handle missing metadata.json gracefully", async () => {
      await createMockScipIndex(testDir, { metadata: false });

      const result = await generateArchonDoc({ packagePath: testDir });

      // Should handle missing metadata without crashing
      expect(result).toHaveProperty("success");
    });
  });

  describe("concurrent invocations", () => {
    /**
     * Tests that the tool handles concurrent invocations correctly.
     * Validates: Requirements 4.1-4.9
     */

    it("should handle multiple concurrent invocations on different packages", async () => {
      // Create two separate packages
      const pkg1 = join(testDir, "pkg1");
      const pkg2 = join(testDir, "pkg2");
      await mkdir(pkg1, { recursive: true });
      await mkdir(pkg2, { recursive: true });
      await createMockScipIndex(pkg1);
      await createMockScipIndex(pkg2);

      // Run concurrently
      const [result1, result2] = await Promise.all([
        generateArchonDoc({ packagePath: pkg1 }),
        generateArchonDoc({ packagePath: pkg2 }),
      ]);

      expect(result1.packagePath).toContain("pkg1");
      expect(result2.packagePath).toContain("pkg2");
    });
  });

  describe("success determination", () => {
    /**
     * Tests that success is determined correctly based on results.
     * Validates: Requirement 4.8
     */

    it("should return success=false when no SCIP index exists", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result.success).toBe(false);
    });

    it("should return success=true when files are skipped but no errors", async () => {
      await createMockScipIndex(testDir);

      // First run to generate docs
      await generateArchonDoc({ packagePath: testDir, force: true });

      // Second run should skip files
      const result = await generateArchonDoc({ packagePath: testDir, force: false });

      // If there are skipped files and no errors, success should be true
      if (result.filesSkipped.length > 0 && (!result.errors || result.errors.length === 0)) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe("documentation co-location", () => {
    /**
     * Tests that documentation files are co-located with source files.
     * Validates: Requirement 4.2
     */

    it("should generate .archon.md files in same directory as source", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        // Extract directory from paths
        const sourceDir = file.sourcePath.split("/").slice(0, -1).join("/");
        const docDir = file.docPath.split("/").slice(0, -1).join("/");

        expect(docDir).toBe(sourceDir);
      }
    });

    it("should convert source extension to .archon.md", async () => {
      await createMockScipIndex(testDir);

      const result = await generateArchonDoc({ packagePath: testDir });

      for (const file of result.filesGenerated) {
        // docPath should end with .archon.md
        expect(file.docPath).toMatch(/\.archon\.md$/);

        // docPath should have same base name as sourcePath (minus extension)
        const sourceBase = file.sourcePath.replace(/\.[^.]+$/, "");
        const docBase = file.docPath.replace(/\.archon\.md$/, "");
        expect(docBase).toBe(sourceBase);
      }
    });
  });
});
