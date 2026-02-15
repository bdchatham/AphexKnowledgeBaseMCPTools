/**
 * Unit Tests for ARN Resolution Tool
 *
 * Tests for the ARN resolution MCP tool that resolves ARNs to file locations
 * and symbol information.
 *
 * @see Requirements 5.1-5.5
 */

import { resolveArn, convertToArchonDocPath } from "../../../src/tools/arn_resolution.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ResolveArnOutput, ResolvedArn } from "../../../src/types/tools.js";

describe("ARN Resolution Tool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `arn-resolution-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
   * Helper to create a test package with source files.
   */
  async function createTestPackage(
    packageName: string,
    files: { path: string; content: string }[]
  ): Promise<string> {
    const packagePath = join(testDir, packageName);
    await mkdir(packagePath, { recursive: true });

    for (const file of files) {
      const filePath = join(packagePath, file.path);
      const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (fileDir !== packagePath) {
        await mkdir(fileDir, { recursive: true });
      }
      await writeFile(filePath, file.content);
    }

    return packagePath;
  }


  describe("response structure validation", () => {
    /**
     * Tests that the tool response contains all required fields.
     * Validates: Requirement 5.3
     */

    it("should return response with all required fields", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/index.ts#main" },
        { workspaceBasePath: testDir }
      );

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("arn");
      expect(result).toHaveProperty("resolved");

      expect(typeof result.success).toBe("boolean");
      expect(typeof result.arn).toBe("string");
    });

    it("should return the original ARN in the response", async () => {
      const inputArn = "arn:archon:code:workspace/package/src/index.ts#main";
      const result = await resolveArn(
        { arn: inputArn },
        { workspaceBasePath: testDir }
      );

      expect(result.arn).toBe(inputArn);
    });

    it("should return resolved object with all required fields for valid code ARN", async () => {
      await createTestPackage("package", [
        { path: "src/index.ts", content: "export const main = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/index.ts#main" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved).not.toBeNull();

      const resolved = result.resolved as ResolvedArn;
      expect(resolved).toHaveProperty("type");
      expect(resolved).toHaveProperty("workspace");
      expect(resolved).toHaveProperty("package");
      expect(resolved).toHaveProperty("path");
      expect(resolved).toHaveProperty("filePath");

      expect(resolved.type).toBe("code");
      expect(resolved.workspace).toBe("workspace");
      expect(resolved.package).toBe("package");
      expect(resolved.path).toBe("src/index.ts");
    });

    it("should return resolved object with optional symbol field when present", async () => {
      await createTestPackage("package", [
        { path: "src/index.ts", content: "export const main = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/index.ts#main" },
        { workspaceBasePath: testDir }
      );

      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.symbol).toBe("main");
    });

    it("should return resolved object without symbol when not in ARN", async () => {
      await createTestPackage("package", [
        { path: "src/index.ts", content: "export const main = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.symbol).toBeUndefined();
    });

    it("should return absolute file path in filePath field", async () => {
      await createTestPackage("package", [
        { path: "src/index.ts", content: "export const main = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.filePath).toMatch(/^[/\\]|^[A-Za-z]:\\/);
    });
  });


  describe("error response format validation", () => {
    /**
     * Tests that error responses contain helpful information.
     * Validates: Requirement 5.4
     */

    it("should return error for invalid ARN format", async () => {
      const result = await resolveArn(
        { arn: "invalid-arn-format" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.resolved).toBeNull();
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    });

    it("should return descriptive error message for malformed ARN", async () => {
      const result = await resolveArn(
        { arn: "not-an-arn" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should return error for ARN missing required components", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:code:" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error for non-existent file", async () => {
      await createTestPackage("package", []);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/nonexistent.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("not found");
    });

    it("should include file path in error message for non-existent file", async () => {
      await createTestPackage("package", []);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/src/missing.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.error).toContain("missing.ts");
    });

    it("should return error for empty ARN string", async () => {
      const result = await resolveArn(
        { arn: "" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error for ARN with invalid type", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:invalid:workspace/package/path" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });


  describe("code ARN resolution", () => {
    /**
     * Tests for resolving code ARNs to source files.
     * Validates: Requirements 5.3, 5.5
     */

    it("should resolve code ARN to existing source file", async () => {
      await createTestPackage("mypackage", [
        { path: "src/lib/utils.ts", content: "export function helper() {}" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/mypackage/src/lib/utils.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.type).toBe("code");
      expect(result.resolved!.filePath).toContain("utils.ts");
    });

    it("should resolve code ARN with symbol component", async () => {
      await createTestPackage("mypackage", [
        { path: "src/index.ts", content: "export const myFunction = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/mypackage/src/index.ts#myFunction" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.symbol).toBe("myFunction");
    });

    it("should resolve code ARN for Go files", async () => {
      await createTestPackage("gopackage", [
        { path: "main.go", content: "package main\n\nfunc main() {}" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/gopackage/main.go" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("main.go");
    });

    it("should resolve code ARN for JavaScript files", async () => {
      await createTestPackage("jspackage", [
        { path: "index.js", content: "module.exports = {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/jspackage/index.js" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("index.js");
    });

    it("should resolve code ARN for deeply nested files", async () => {
      await createTestPackage("deeppackage", [
        { path: "src/lib/utils/helpers/format.ts", content: "export const format = () => {};" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/deeppackage/src/lib/utils/helpers/format.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.path).toBe("src/lib/utils/helpers/format.ts");
    });

    it("should extract correct workspace from ARN", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:my-workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.workspace).toBe("my-workspace");
    });

    it("should extract correct package from ARN", async () => {
      await createTestPackage("my-package-name", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/my-package-name/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.package).toBe("my-package-name");
    });
  });


  describe("doc ARN resolution", () => {
    /**
     * Tests for resolving doc ARNs to .archon.md files.
     * Validates: Requirement 5.5
     */

    it("should resolve doc ARN to .archon.md file", async () => {
      await createTestPackage("docpackage", [
        { path: "src/lib/utils.archon.md", content: "# Utils Documentation" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/docpackage/src/lib/utils.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.type).toBe("doc");
      expect(result.resolved!.filePath).toContain(".archon.md");
    });

    it("should convert source path to .archon.md path for doc ARN", async () => {
      await createTestPackage("docpackage", [
        { path: "src/index.archon.md", content: "# Index Documentation" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/docpackage/src/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("index.archon.md");
    });

    it("should return error for non-existent doc file", async () => {
      await createTestPackage("docpackage", []);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/docpackage/src/missing.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should resolve doc ARN for Go source files", async () => {
      await createTestPackage("godocpackage", [
        { path: "main.archon.md", content: "# Main Documentation" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/godocpackage/main.go" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("main.archon.md");
    });

    it("should not include lineNumber for doc ARNs", async () => {
      await createTestPackage("docpackage", [
        { path: "src/index.archon.md", content: "# Documentation" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/docpackage/src/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.lineNumber).toBeUndefined();
    });
  });


  describe("convertToArchonDocPath helper function", () => {
    /**
     * Tests for the convertToArchonDocPath helper function.
     * Validates: Requirement 5.5
     */

    it("should convert .ts file to .archon.md", () => {
      const result = convertToArchonDocPath("src/lib/utils.ts");
      expect(result).toBe("src/lib/utils.archon.md");
    });

    it("should convert .js file to .archon.md", () => {
      const result = convertToArchonDocPath("src/index.js");
      expect(result).toBe("src/index.archon.md");
    });

    it("should convert .go file to .archon.md", () => {
      const result = convertToArchonDocPath("main.go");
      expect(result).toBe("main.archon.md");
    });

    it("should convert .tsx file to .archon.md", () => {
      const result = convertToArchonDocPath("components/Button.tsx");
      expect(result).toBe("components/Button.archon.md");
    });

    it("should convert .jsx file to .archon.md", () => {
      const result = convertToArchonDocPath("components/App.jsx");
      expect(result).toBe("components/App.archon.md");
    });

    it("should return .archon.md path unchanged", () => {
      const result = convertToArchonDocPath("src/lib/utils.archon.md");
      expect(result).toBe("src/lib/utils.archon.md");
    });

    it("should handle file without extension", () => {
      const result = convertToArchonDocPath("Makefile");
      expect(result).toBe("Makefile.archon.md");
    });

    it("should handle deeply nested paths", () => {
      const result = convertToArchonDocPath("src/lib/utils/helpers/format.ts");
      expect(result).toBe("src/lib/utils/helpers/format.archon.md");
    });

    it("should handle file with multiple dots in name", () => {
      const result = convertToArchonDocPath("src/config.prod.ts");
      expect(result).toBe("src/config.prod.archon.md");
    });

    it("should handle Windows-style paths", () => {
      const result = convertToArchonDocPath("src\\lib\\utils.ts");
      expect(result).toBe("src\\lib\\utils.archon.md");
    });

    it("should handle root-level files", () => {
      const result = convertToArchonDocPath("index.ts");
      expect(result).toBe("index.archon.md");
    });
  });


  describe("ARN type handling", () => {
    /**
     * Tests for handling different ARN types.
     * Validates: Requirements 5.3, 5.5
     */

    it("should handle code ARN type", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.type).toBe("code");
    });

    it("should handle doc ARN type", async () => {
      await createTestPackage("pkg", [
        { path: "index.archon.md", content: "# Documentation" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.type).toBe("doc");
    });

    it("should handle k8s ARN type", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:k8s:workspace/pkg/deployment.yaml" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.type).toBe("k8s");
    });

    it("should handle infra ARN type", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:infra:workspace/pkg/stack.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.type).toBe("infra");
    });
  });


  describe("workspaceBasePath option", () => {
    /**
     * Tests for the workspaceBasePath option.
     * Validates: Requirements 5.1, 5.3
     */

    it("should use provided workspaceBasePath for resolution", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain(testDir);
    });

    it("should default to current working directory when workspaceBasePath not provided", async () => {
      const result = await resolveArn({ arn: "arn:archon:code:workspace/pkg/index.ts" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("arn");
    });

    it("should resolve files relative to workspaceBasePath", async () => {
      const subDir = join(testDir, "subworkspace");
      await mkdir(subDir, { recursive: true });
      await mkdir(join(subDir, "pkg"), { recursive: true });
      await writeFile(join(subDir, "pkg", "index.ts"), "export const x = 1;");

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts" },
        { workspaceBasePath: subDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("subworkspace");
    });
  });


  describe("edge cases", () => {
    /**
     * Tests for edge cases and boundary conditions.
     * Validates: Requirements 5.1-5.5
     */

    it("should handle package path with spaces", async () => {
      const spacePath = join(testDir, "package with spaces");
      await mkdir(spacePath, { recursive: true });
      await writeFile(join(spacePath, "index.ts"), "export const x = 1;");

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package with spaces/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("package with spaces");
    });

    it("should handle package path with unicode characters", async () => {
      const unicodePath = join(testDir, "包裹");
      await mkdir(unicodePath, { recursive: true });
      await writeFile(join(unicodePath, "index.ts"), "export const x = 1;");

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/包裹/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.filePath).toContain("包裹");
    });

    it("should handle file path with special characters", async () => {
      await createTestPackage("pkg", [
        { path: "src/my-file_v2.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/src/my-file_v2.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.path).toBe("src/my-file_v2.ts");
    });

    it("should handle symbol with escaped characters", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts#MyClass%2Fmethod" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
    });

    it("should handle very long file paths", async () => {
      const longPath = "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z";
      const packagePath = join(testDir, "pkg");
      await mkdir(join(packagePath, longPath), { recursive: true });
      await writeFile(join(packagePath, longPath, "index.ts"), "export const x = 1;");

      const result = await resolveArn(
        { arn: `arn:archon:code:workspace/pkg/${longPath}/index.ts` },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
    });

    it("should handle ARN with only path (no symbol)", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved!.symbol).toBeUndefined();
    });
  });


  describe("concurrent invocations", () => {
    /**
     * Tests that the tool handles concurrent invocations correctly.
     * Validates: Requirements 5.1-5.5
     */

    it("should handle multiple concurrent invocations", async () => {
      await createTestPackage("pkg1", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);
      await createTestPackage("pkg2", [
        { path: "main.go", content: "package main" },
      ]);

      const [result1, result2] = await Promise.all([
        resolveArn(
          { arn: "arn:archon:code:workspace/pkg1/index.ts" },
          { workspaceBasePath: testDir }
        ),
        resolveArn(
          { arn: "arn:archon:code:workspace/pkg2/main.go" },
          { workspaceBasePath: testDir }
        ),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.resolved!.package).toBe("pkg1");
      expect(result2.resolved!.package).toBe("pkg2");
    });

    it("should handle concurrent resolution of same ARN", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const arn = "arn:archon:code:workspace/pkg/index.ts";
      const results = await Promise.all([
        resolveArn({ arn }, { workspaceBasePath: testDir }),
        resolveArn({ arn }, { workspaceBasePath: testDir }),
        resolveArn({ arn }, { workspaceBasePath: testDir }),
      ]);

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.resolved!.filePath).toContain("index.ts");
      }
    });
  });


  describe("input validation", () => {
    /**
     * Tests for input validation.
     * Validates: Requirement 5.1
     */

    it("should accept valid ARN string as input", async () => {
      await createTestPackage("pkg", [
        { path: "index.ts", content: "export const x = 1;" },
      ]);

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("arn");
    });

    it("should validate ARN format before resolution", async () => {
      const result = await resolveArn(
        { arn: "not-a-valid-arn" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject ARN with wrong prefix", async () => {
      const result = await resolveArn(
        { arn: "arn:aws:s3:bucket/key" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject ARN with missing path component", async () => {
      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
