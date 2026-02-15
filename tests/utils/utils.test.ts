/**
 * Tests for Test Utilities
 *
 * Verifies that the test utilities work correctly and can be imported.
 */

import * as fc from "fast-check";
import {
  // Generators
  arnTypeArb,
  symbolKindArb,
  filePathArb,
  VALID_ARN_TYPES,
  VALID_SYMBOL_KINDS,
  arnComponentsArb,
  scipSymbolArb,
  sourceFilePathArb,
  packageTypeArb,
  goModuleNameArb,
  npmPackageNameArb,
  // Helpers
  createTestDir,
  cleanupTestDir,
  createTestDirWithCleanup,
  createFile,
  createFiles,
  fileExists,
  createGoModContent,
  createPackageJsonContent,
  createTestPackage,
  getExpectedDocPath,
  getDirectory,
  getFileNameWithoutExtension,
  // Constants
  DEFAULT_PBT_ITERATIONS,
  REDUCED_PBT_ITERATIONS,
  TOOL_INVOCATION_TIMEOUT,
} from "./index.js";
import { join } from "node:path";

describe("Test Utilities", () => {
  describe("Generators", () => {
    it("should export valid ARN types constant", () => {
      expect(VALID_ARN_TYPES).toEqual(["code", "doc", "k8s", "infra"]);
    });

    it("should export valid symbol kinds constant", () => {
      expect(VALID_SYMBOL_KINDS).toEqual([
        "function",
        "class",
        "method",
        "variable",
        "type",
        "module",
      ]);
    });

    it("should generate valid ARN types", () => {
      fc.assert(
        fc.property(arnTypeArb, (type) => {
          expect(VALID_ARN_TYPES).toContain(type);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid symbol kinds", () => {
      fc.assert(
        fc.property(symbolKindArb, (kind) => {
          expect(VALID_SYMBOL_KINDS).toContain(kind);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid file paths", () => {
      fc.assert(
        fc.property(filePathArb, (path) => {
          expect(path.length).toBeGreaterThan(0);
          expect(path).not.toContain(":");
          expect(path).not.toContain("#");
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid ARN components", () => {
      fc.assert(
        fc.property(arnComponentsArb, (components) => {
          expect(VALID_ARN_TYPES).toContain(components.type);
          expect(components.workspace.length).toBeGreaterThan(0);
          expect(components.package.length).toBeGreaterThan(0);
          expect(components.path.length).toBeGreaterThan(0);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid SCIP symbols", () => {
      fc.assert(
        fc.property(scipSymbolArb, (symbol) => {
          expect(symbol.name.length).toBeGreaterThan(0);
          expect(VALID_SYMBOL_KINDS).toContain(symbol.kind);
          expect(symbol.signature.length).toBeGreaterThan(0);
          expect(symbol.location.file.length).toBeGreaterThan(0);
          expect(symbol.location.line).toBeGreaterThanOrEqual(1);
          expect(symbol.location.column).toBeGreaterThanOrEqual(0);
          expect(symbol.arn).toContain("arn:archon:code:");
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid source file paths", () => {
      fc.assert(
        fc.property(sourceFilePathArb, (path) => {
          expect(path.length).toBeGreaterThan(0);
          // Should have a file extension
          expect(path).toMatch(/\.[a-z]+$/i);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid package types", () => {
      fc.assert(
        fc.property(packageTypeArb, (type) => {
          expect(["go", "typescript", "both"]).toContain(type);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid Go module names", () => {
      fc.assert(
        fc.property(goModuleNameArb, (name) => {
          expect(name).toMatch(/^example\.com\/[a-z]/);
        }),
        { numRuns: 20 }
      );
    });

    it("should generate valid npm package names", () => {
      fc.assert(
        fc.property(npmPackageNameArb, (name) => {
          expect(name.length).toBeGreaterThan(0);
          expect(name).toMatch(/^[a-z]/);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe("Helpers - Directory Management", () => {
    it("should create and cleanup test directories", async () => {
      const testDir = await createTestDir("utils-test");
      expect(testDir).toContain("utils-test");
      expect(await fileExists(testDir)).toBe(true);

      await cleanupTestDir(testDir);
      expect(await fileExists(testDir)).toBe(false);
    });

    it("should create test directory with cleanup function", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("utils-test");
      expect(testDir).toContain("utils-test");
      expect(await fileExists(testDir)).toBe(true);

      await cleanup();
      expect(await fileExists(testDir)).toBe(false);
    });
  });

  describe("Helpers - File Operations", () => {
    it("should create files with parent directories", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("file-test");
      try {
        const filePath = join(testDir, "nested", "dir", "file.txt");
        await createFile(filePath, "test content");
        expect(await fileExists(filePath)).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it("should create multiple files at once", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("files-test");
      try {
        await createFiles(testDir, {
          "file1.txt": "content1",
          "nested/file2.txt": "content2",
        });
        expect(await fileExists(join(testDir, "file1.txt"))).toBe(true);
        expect(await fileExists(join(testDir, "nested", "file2.txt"))).toBe(true);
      } finally {
        await cleanup();
      }
    });
  });

  describe("Helpers - Package Content Generation", () => {
    it("should create valid go.mod content", () => {
      const content = createGoModContent("example.com/mymodule");
      expect(content).toContain("module example.com/mymodule");
      expect(content).toContain("go 1.21");
    });

    it("should create valid package.json content", () => {
      const content = createPackageJsonContent("my-package");
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe("my-package");
      expect(parsed.version).toBe("1.0.0");
    });
  });

  describe("Helpers - Test Package Creation", () => {
    it("should create Go package", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("go-pkg-test");
      try {
        const pkgPath = await createTestPackage(testDir, {
          pathSegments: ["my-go-pkg"],
          type: "go",
          name: "my-go-pkg",
        });
        expect(await fileExists(join(pkgPath, "go.mod"))).toBe(true);
        expect(await fileExists(join(pkgPath, "main.go"))).toBe(true);
        expect(await fileExists(join(pkgPath, "package.json"))).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it("should create TypeScript package", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("ts-pkg-test");
      try {
        const pkgPath = await createTestPackage(testDir, {
          pathSegments: ["my-ts-pkg"],
          type: "typescript",
          name: "my-ts-pkg",
        });
        expect(await fileExists(join(pkgPath, "package.json"))).toBe(true);
        expect(await fileExists(join(pkgPath, "index.ts"))).toBe(true);
        expect(await fileExists(join(pkgPath, "go.mod"))).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it("should create multi-language package", async () => {
      const { testDir, cleanup } = await createTestDirWithCleanup("multi-pkg-test");
      try {
        const pkgPath = await createTestPackage(testDir, {
          pathSegments: ["my-multi-pkg"],
          type: "both",
          name: "my-multi-pkg",
        });
        expect(await fileExists(join(pkgPath, "go.mod"))).toBe(true);
        expect(await fileExists(join(pkgPath, "main.go"))).toBe(true);
        expect(await fileExists(join(pkgPath, "package.json"))).toBe(true);
        expect(await fileExists(join(pkgPath, "index.ts"))).toBe(true);
      } finally {
        await cleanup();
      }
    });
  });

  describe("Helpers - Documentation Path Utilities", () => {
    it("should compute expected doc path correctly", () => {
      expect(getExpectedDocPath("src/lib/arn.ts")).toBe("src/lib/arn.archon.md");
      expect(getExpectedDocPath("main.go")).toBe("main.archon.md");
      expect(getExpectedDocPath("nested/dir/file.js")).toBe("nested/dir/file.archon.md");
    });

    it("should extract directory correctly", () => {
      expect(getDirectory("src/lib/arn.ts")).toBe("src/lib");
      expect(getDirectory("main.go")).toBe("");
      expect(getDirectory("nested/dir/file.js")).toBe("nested/dir");
    });

    it("should extract file name without extension correctly", () => {
      expect(getFileNameWithoutExtension("src/lib/arn.ts")).toBe("arn");
      expect(getFileNameWithoutExtension("main.go")).toBe("main");
      expect(getFileNameWithoutExtension("file.archon.md")).toBe("file");
    });
  });

  describe("Constants", () => {
    it("should export correct PBT iteration constants", () => {
      expect(DEFAULT_PBT_ITERATIONS).toBe(100);
      expect(REDUCED_PBT_ITERATIONS).toBe(15);
    });

    it("should export correct timeout constants", () => {
      expect(TOOL_INVOCATION_TIMEOUT).toBe(30000);
    });
  });
});
