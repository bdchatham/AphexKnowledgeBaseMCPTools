/**
 * Unit Tests for Language Detector
 *
 * Tests for the language detection function that identifies Go and TypeScript/JavaScript
 * code in package directories by examining file markers.
 *
 * @see Requirements 1.3, 1.4
 */

import { detect } from "../../../src/lib/language_detector.js";
import { mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Language Detector", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `lang-detector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("empty directories", () => {
    /**
     * Tests for empty directory handling.
     * Validates: Requirements 1.3, 1.4
     */

    it("should return no languages detected for empty directory", async () => {
      const result = await detect(testDir);

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
      expect(result.goRoot).toBeUndefined();
      expect(result.tsRoot).toBeUndefined();
    });

    it("should return no languages for directory with only subdirectories", async () => {
      await mkdir(join(testDir, "subdir1"));
      await mkdir(join(testDir, "subdir2"));

      const result = await detect(testDir);

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
    });

    it("should return no languages for directory with unrelated files", async () => {
      await writeFile(join(testDir, "README.md"), "# Test");
      await writeFile(join(testDir, ".gitignore"), "node_modules");
      await writeFile(join(testDir, "config.yaml"), "key: value");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
    });
  });

  describe("Go detection", () => {
    /**
     * Tests for Go language detection.
     * Validates: Requirement 1.3
     */

    describe("via go.mod", () => {
      it("should detect Go when go.mod is present", async () => {
        await writeFile(join(testDir, "go.mod"), "module example.com/test\n\ngo 1.21");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });

      it("should detect Go with go.mod even without .go files", async () => {
        await writeFile(join(testDir, "go.mod"), "module example.com/test");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });

      it("should detect Go with empty go.mod file", async () => {
        await writeFile(join(testDir, "go.mod"), "");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });
    });

    describe("via .go files", () => {
      it("should detect Go when .go files are present without go.mod", async () => {
        await writeFile(join(testDir, "main.go"), "package main\n\nfunc main() {}");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });

      it("should detect Go with multiple .go files", async () => {
        await writeFile(join(testDir, "main.go"), "package main");
        await writeFile(join(testDir, "utils.go"), "package main");
        await writeFile(join(testDir, "types.go"), "package main");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });

      it("should detect Go with _test.go files", async () => {
        await writeFile(join(testDir, "main_test.go"), "package main");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(true);
        expect(result.goRoot).toBe(testDir);
      });
    });

    describe("edge cases", () => {
      it("should not detect Go for files with .go in name but different extension", async () => {
        await writeFile(join(testDir, "file.go.bak"), "backup");
        await writeFile(join(testDir, "go.txt"), "text");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(false);
      });

      it("should not detect Go for go.mod in subdirectory (only checks root)", async () => {
        await mkdir(join(testDir, "subpkg"));
        await writeFile(join(testDir, "subpkg", "go.mod"), "module subpkg");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(false);
      });

      it("should not detect Go for .go files in subdirectory (only checks root)", async () => {
        await mkdir(join(testDir, "cmd"));
        await writeFile(join(testDir, "cmd", "main.go"), "package main");

        const result = await detect(testDir);

        expect(result.hasGo).toBe(false);
      });
    });
  });

  describe("TypeScript/JavaScript detection", () => {
    /**
     * Tests for TypeScript/JavaScript detection.
     * Validates: Requirement 1.4
     */

    describe("via package.json", () => {
      it("should detect TypeScript when package.json is present", async () => {
        await writeFile(join(testDir, "package.json"), '{"name": "test"}');

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with package.json even without .ts/.js files", async () => {
        await writeFile(join(testDir, "package.json"), '{}');

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with empty package.json file", async () => {
        await writeFile(join(testDir, "package.json"), "");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });
    });

    describe("via .ts files", () => {
      it("should detect TypeScript when .ts files are present without package.json", async () => {
        await writeFile(join(testDir, "index.ts"), "export const x = 1;");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with multiple .ts files", async () => {
        await writeFile(join(testDir, "index.ts"), "export const x = 1;");
        await writeFile(join(testDir, "utils.ts"), "export function util() {}");
        await writeFile(join(testDir, "types.ts"), "export type T = string;");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with .tsx files", async () => {
        await writeFile(join(testDir, "App.tsx"), "export const App = () => <div />;");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });
    });

    describe("via .js files", () => {
      it("should detect TypeScript when .js files are present without package.json", async () => {
        await writeFile(join(testDir, "index.js"), "module.exports = {};");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with .jsx files", async () => {
        await writeFile(join(testDir, "App.jsx"), "export const App = () => <div />;");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });

      it("should detect TypeScript with mixed .ts and .js files", async () => {
        await writeFile(join(testDir, "index.ts"), "export const x = 1;");
        await writeFile(join(testDir, "legacy.js"), "module.exports = {};");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(true);
        expect(result.tsRoot).toBe(testDir);
      });
    });

    describe("edge cases", () => {
      it("should not detect TypeScript for files with .ts in name but different extension", async () => {
        await writeFile(join(testDir, "file.ts.bak"), "backup");
        await writeFile(join(testDir, "ts.txt"), "text");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(false);
      });

      it("should not detect TypeScript for package.json in subdirectory (only checks root)", async () => {
        await mkdir(join(testDir, "subpkg"));
        await writeFile(join(testDir, "subpkg", "package.json"), '{}');

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(false);
      });

      it("should not detect TypeScript for .ts files in subdirectory (only checks root)", async () => {
        await mkdir(join(testDir, "src"));
        await writeFile(join(testDir, "src", "index.ts"), "export const x = 1;");

        const result = await detect(testDir);

        expect(result.hasTypeScript).toBe(false);
      });
    });
  });

  describe("mixed language detection", () => {
    /**
     * Tests for directories containing both Go and TypeScript.
     * Validates: Requirements 1.3, 1.4
     */

    it("should detect both Go and TypeScript when both markers present", async () => {
      await writeFile(join(testDir, "go.mod"), "module example.com/test");
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
      expect(result.goRoot).toBe(testDir);
      expect(result.tsRoot).toBe(testDir);
    });

    it("should detect both languages with .go and .ts files", async () => {
      await writeFile(join(testDir, "main.go"), "package main");
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
      expect(result.goRoot).toBe(testDir);
      expect(result.tsRoot).toBe(testDir);
    });

    it("should detect both languages with go.mod and .js files", async () => {
      await writeFile(join(testDir, "go.mod"), "module example.com/test");
      await writeFile(join(testDir, "script.js"), "console.log('hello');");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });

    it("should detect both languages with .go files and package.json", async () => {
      await writeFile(join(testDir, "main.go"), "package main");
      await writeFile(join(testDir, "package.json"), '{}');

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });

    it("should detect both languages with all marker types present", async () => {
      await writeFile(join(testDir, "go.mod"), "module example.com/test");
      await writeFile(join(testDir, "main.go"), "package main");
      await writeFile(join(testDir, "package.json"), '{}');
      await writeFile(join(testDir, "index.ts"), "export const x = 1;");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
      expect(result.goRoot).toBe(testDir);
      expect(result.tsRoot).toBe(testDir);
    });
  });

  describe("non-existent directories", () => {
    /**
     * Tests for handling non-existent directories.
     * Validates: Requirements 1.3, 1.4
     */

    it("should return empty result for non-existent directory", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      const result = await detect(nonExistentPath);

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
      expect(result.goRoot).toBeUndefined();
      expect(result.tsRoot).toBeUndefined();
    });

    it("should return empty result for path that is a file, not directory", async () => {
      const filePath = join(testDir, "file.txt");
      await writeFile(filePath, "content");

      const result = await detect(filePath);

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
    });

    it("should return empty result for empty string path", async () => {
      const result = await detect("");

      expect(result.hasGo).toBe(false);
      expect(result.hasTypeScript).toBe(false);
    });
  });

  describe("permission errors", () => {
    /**
     * Tests for graceful handling of permission errors.
     * Validates: Requirements 1.3, 1.4
     */

    it("should handle directory with no read permission gracefully", async () => {
      const restrictedDir = join(testDir, "restricted");
      await mkdir(restrictedDir);
      await writeFile(join(restrictedDir, "go.mod"), "module test");

      // Skip this test on Windows where chmod doesn't work the same way
      if (process.platform === "win32") {
        return;
      }

      try {
        await chmod(restrictedDir, 0o000);

        const result = await detect(restrictedDir);

        // Should return empty result rather than throwing
        expect(result.hasGo).toBe(false);
        expect(result.hasTypeScript).toBe(false);
      } finally {
        // Restore permissions for cleanup
        await chmod(restrictedDir, 0o755);
      }
    });
  });

  describe("special file names", () => {
    /**
     * Tests for edge cases with special file names.
     * Validates: Requirements 1.3, 1.4
     */

    it("should detect Go with uppercase .GO extension (case sensitivity)", async () => {
      // Note: This tests the implementation's case sensitivity
      // The implementation uses endsWith which is case-sensitive
      await writeFile(join(testDir, "main.GO"), "package main");

      const result = await detect(testDir);

      // Implementation is case-sensitive, so .GO won't be detected
      expect(result.hasGo).toBe(false);
    });

    it("should detect TypeScript with uppercase .TS extension (case sensitivity)", async () => {
      await writeFile(join(testDir, "index.TS"), "export const x = 1;");

      const result = await detect(testDir);

      // Implementation is case-sensitive, so .TS won't be detected
      expect(result.hasTypeScript).toBe(false);
    });

    it("should handle files with multiple extensions correctly", async () => {
      await writeFile(join(testDir, "file.test.ts"), "test");
      await writeFile(join(testDir, "file.spec.go"), "package test");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });

    it("should handle hidden files with language extensions", async () => {
      await writeFile(join(testDir, ".hidden.ts"), "export const x = 1;");
      await writeFile(join(testDir, ".hidden.go"), "package main");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });

    it("should handle files with spaces in names", async () => {
      await writeFile(join(testDir, "my file.ts"), "export const x = 1;");
      await writeFile(join(testDir, "my module.go"), "package main");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });

    it("should handle files with unicode characters in names", async () => {
      await writeFile(join(testDir, "文件.ts"), "export const x = 1;");
      await writeFile(join(testDir, "模块.go"), "package main");

      const result = await detect(testDir);

      expect(result.hasGo).toBe(true);
      expect(result.hasTypeScript).toBe(true);
    });
  });
});
