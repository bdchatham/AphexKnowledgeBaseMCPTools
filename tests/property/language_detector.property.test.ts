/**
 * Property-Based Tests for Language Detector
 *
 * Tests Property 1: Language Detection Accuracy
 *
 * Property 1: For any package directory structure, the language detector SHALL
 * correctly identify the presence of Go (via `go.mod` or `.go` files) and
 * TypeScript (via `package.json` or `.js`/`.ts` files), returning accurate
 * detection results regardless of directory depth or file count.
 *
 * **Validates: Requirements 1.3, 1.4**
 *
 * @see Design Document: Property 1: Language Detection Accuracy
 */

import * as fc from "fast-check";
import { detect } from "../../src/lib/language_detector.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Test directory management utilities
 */
let testDirCounter = 0;

async function createTestDir(): Promise<string> {
  const testDir = join(
    tmpdir(),
    `lang-detector-pbt-${Date.now()}-${testDirCounter++}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(testDir, { recursive: true });
  return testDir;
}

async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Go language markers
 */
const GO_MARKERS = {
  GO_MOD: "go.mod",
  GO_EXTENSIONS: [".go"],
} as const;

/**
 * TypeScript/JavaScript language markers
 */
const TS_MARKERS = {
  PACKAGE_JSON: "package.json",
  TS_EXTENSIONS: [".ts", ".tsx", ".js", ".jsx"],
} as const;

/**
 * Arbitrary for generating valid file names (without extensions)
 * - Non-empty strings
 * - No path separators
 * - No null characters
 */
const fileNameArb = fc
  .stringOf(
    fc.char().filter((c) => c !== "/" && c !== "\\" && c !== "\0" && c !== "."),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating Go file names
 */
const goFileNameArb = fileNameArb.map((name) => `${name}.go`);

/**
 * Arbitrary for generating TypeScript file names
 */
const tsFileNameArb = fc.tuple(fileNameArb, fc.constantFrom(...TS_MARKERS.TS_EXTENSIONS))
  .map(([name, ext]) => `${name}${ext}`);

/**
 * Arbitrary for generating unrelated file names (not Go or TypeScript markers)
 */
const unrelatedFileNameArb = fc
  .tuple(
    fileNameArb,
    fc.constantFrom(".md", ".txt", ".yaml", ".json", ".xml", ".css", ".html", ".py", ".rb")
  )
  .map(([name, ext]) => `${name}${ext}`)
  .filter((name) => name !== "package.json"); // Exclude package.json as it's a TS marker

/**
 * Arbitrary for generating file content (simple placeholder content)
 */
const fileContentArb = fc.string({ minLength: 0, maxLength: 100 });

/**
 * Arbitrary for generating Go module content
 */
const goModContentArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  fc.constantFrom("1.18", "1.19", "1.20", "1.21", "1.22")
).map(([module, version]) => `module ${module}\n\ngo ${version}`);

/**
 * Arbitrary for generating package.json content
 */
const packageJsonContentArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  version: fc.constantFrom("1.0.0", "0.1.0", "2.0.0"),
}).map((pkg) => JSON.stringify(pkg));

/**
 * Arbitrary for generating Go source file content
 */
const goSourceContentArb = fc.constantFrom(
  "package main\n\nfunc main() {}",
  "package utils\n\nfunc Helper() {}",
  "package test\n\nimport \"testing\"\n\nfunc TestExample(t *testing.T) {}"
);

/**
 * Arbitrary for generating TypeScript source file content
 */
const tsSourceContentArb = fc.constantFrom(
  "export const x = 1;",
  "export function helper() {}",
  "export type MyType = string;",
  "import { something } from './other';"
);

/**
 * Arbitrary for generating the number of files to create
 */
const fileCountArb = fc.integer({ min: 0, max: 10 });

/**
 * Configuration for directory structure generation
 */
interface DirectoryConfig {
  hasGoMod: boolean;
  goFileCount: number;
  hasPackageJson: boolean;
  tsFileCount: number;
  unrelatedFileCount: number;
}

/**
 * Arbitrary for generating directory configurations
 */
const directoryConfigArb: fc.Arbitrary<DirectoryConfig> = fc.record({
  hasGoMod: fc.boolean(),
  goFileCount: fileCountArb,
  hasPackageJson: fc.boolean(),
  tsFileCount: fileCountArb,
  unrelatedFileCount: fileCountArb,
});

/**
 * Creates a directory structure based on the given configuration
 */
async function createDirectoryStructure(
  testDir: string,
  config: DirectoryConfig,
  goModContent: string,
  packageJsonContent: string,
  goFileNames: string[],
  tsFileNames: string[],
  unrelatedFileNames: string[]
): Promise<void> {
  // Create go.mod if configured
  if (config.hasGoMod) {
    await writeFile(join(testDir, GO_MARKERS.GO_MOD), goModContent);
  }

  // Create .go files
  for (let i = 0; i < Math.min(config.goFileCount, goFileNames.length); i++) {
    await writeFile(
      join(testDir, goFileNames[i]),
      "package main\n\nfunc main() {}"
    );
  }

  // Create package.json if configured
  if (config.hasPackageJson) {
    await writeFile(join(testDir, TS_MARKERS.PACKAGE_JSON), packageJsonContent);
  }

  // Create .ts/.js files
  for (let i = 0; i < Math.min(config.tsFileCount, tsFileNames.length); i++) {
    await writeFile(join(testDir, tsFileNames[i]), "export const x = 1;");
  }

  // Create unrelated files
  for (let i = 0; i < Math.min(config.unrelatedFileCount, unrelatedFileNames.length); i++) {
    await writeFile(join(testDir, unrelatedFileNames[i]), "content");
  }
}

/**
 * Determines expected detection result based on configuration
 */
function getExpectedResult(config: DirectoryConfig): {
  expectedHasGo: boolean;
  expectedHasTypeScript: boolean;
} {
  // Go is detected if go.mod exists OR any .go files exist
  const expectedHasGo = config.hasGoMod || config.goFileCount > 0;

  // TypeScript is detected if package.json exists OR any .ts/.js files exist
  const expectedHasTypeScript = config.hasPackageJson || config.tsFileCount > 0;

  return { expectedHasGo, expectedHasTypeScript };
}

describe("Feature: documentation-tools, Property 1: Language Detection Accuracy", () => {
  /**
   * Property 1.1: Go detection via go.mod
   *
   * For any directory containing a go.mod file, the detector SHALL
   * correctly identify hasGo as true and set goRoot to the directory path.
   *
   * **Validates: Requirement 1.3**
   */
  it("should detect Go when go.mod is present", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModContentArb,
        fileCountArb,
        fc.array(unrelatedFileNameArb, { minLength: 0, maxLength: 5 }),
        async (goModContent, unrelatedCount, unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Create go.mod
            await writeFile(join(testDir, GO_MARKERS.GO_MOD), goModContent);

            // Create some unrelated files
            for (let i = 0; i < Math.min(unrelatedCount, unrelatedFiles.length); i++) {
              await writeFile(join(testDir, unrelatedFiles[i]), "content");
            }

            const result = await detect(testDir);

            expect(result.hasGo).toBe(true);
            expect(result.goRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.2: Go detection via .go files
   *
   * For any directory containing .go files (without go.mod), the detector SHALL
   * correctly identify hasGo as true and set goRoot to the directory path.
   *
   * **Validates: Requirement 1.3**
   */
  it("should detect Go when .go files are present (without go.mod)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(goFileNameArb, { minLength: 1, maxLength: 5 }),
        fc.array(unrelatedFileNameArb, { minLength: 0, maxLength: 5 }),
        async (goFiles, unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Create .go files (ensure unique names)
            const uniqueGoFiles = [...new Set(goFiles)];
            for (const goFile of uniqueGoFiles) {
              await writeFile(
                join(testDir, goFile),
                "package main\n\nfunc main() {}"
              );
            }

            // Create some unrelated files (ensure unique and no conflicts)
            const uniqueUnrelated = [...new Set(unrelatedFiles)].filter(
              (f) => !uniqueGoFiles.includes(f)
            );
            for (const file of uniqueUnrelated) {
              await writeFile(join(testDir, file), "content");
            }

            const result = await detect(testDir);

            expect(result.hasGo).toBe(true);
            expect(result.goRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.3: TypeScript detection via package.json
   *
   * For any directory containing a package.json file, the detector SHALL
   * correctly identify hasTypeScript as true and set tsRoot to the directory path.
   *
   * **Validates: Requirement 1.4**
   */
  it("should detect TypeScript when package.json is present", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageJsonContentArb,
        fc.array(unrelatedFileNameArb, { minLength: 0, maxLength: 5 }),
        async (packageJsonContent, unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Create package.json
            await writeFile(
              join(testDir, TS_MARKERS.PACKAGE_JSON),
              packageJsonContent
            );

            // Create some unrelated files (filter out package.json if present)
            const uniqueUnrelated = [...new Set(unrelatedFiles)].filter(
              (f) => f !== "package.json"
            );
            for (const file of uniqueUnrelated) {
              await writeFile(join(testDir, file), "content");
            }

            const result = await detect(testDir);

            expect(result.hasTypeScript).toBe(true);
            expect(result.tsRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.4: TypeScript detection via .ts/.js files
   *
   * For any directory containing .ts/.tsx/.js/.jsx files (without package.json),
   * the detector SHALL correctly identify hasTypeScript as true and set tsRoot
   * to the directory path.
   *
   * **Validates: Requirement 1.4**
   */
  it("should detect TypeScript when .ts/.js files are present (without package.json)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tsFileNameArb, { minLength: 1, maxLength: 5 }),
        fc.array(unrelatedFileNameArb, { minLength: 0, maxLength: 5 }),
        async (tsFiles, unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Create .ts/.js files (ensure unique names)
            const uniqueTsFiles = [...new Set(tsFiles)];
            for (const tsFile of uniqueTsFiles) {
              await writeFile(join(testDir, tsFile), "export const x = 1;");
            }

            // Create some unrelated files (ensure unique, no conflicts, no package.json)
            const uniqueUnrelated = [...new Set(unrelatedFiles)].filter(
              (f) => !uniqueTsFiles.includes(f) && f !== "package.json"
            );
            for (const file of uniqueUnrelated) {
              await writeFile(join(testDir, file), "content");
            }

            const result = await detect(testDir);

            expect(result.hasTypeScript).toBe(true);
            expect(result.tsRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.5: No language detection for empty/unrelated directories
   *
   * For any directory containing only unrelated files (no Go or TypeScript markers),
   * the detector SHALL correctly identify both hasGo and hasTypeScript as false.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it("should not detect any language when only unrelated files are present", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unrelatedFileNameArb, { minLength: 0, maxLength: 10 }),
        async (unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Create only unrelated files (ensure unique and no package.json)
            const uniqueUnrelated = [...new Set(unrelatedFiles)].filter(
              (f) => f !== "package.json"
            );
            for (const file of uniqueUnrelated) {
              await writeFile(join(testDir, file), "content");
            }

            const result = await detect(testDir);

            expect(result.hasGo).toBe(false);
            expect(result.hasTypeScript).toBe(false);
            expect(result.goRoot).toBeUndefined();
            expect(result.tsRoot).toBeUndefined();
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.6: Mixed language detection (Go and TypeScript)
   *
   * For any directory containing both Go markers (go.mod or .go files) and
   * TypeScript markers (package.json or .ts/.js files), the detector SHALL
   * correctly identify both hasGo and hasTypeScript as true.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it("should detect both Go and TypeScript when both markers are present", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // hasGoMod
        fc.array(goFileNameArb, { minLength: 0, maxLength: 3 }),
        fc.boolean(), // hasPackageJson
        fc.array(tsFileNameArb, { minLength: 0, maxLength: 3 }),
        async (hasGoMod, goFiles, hasPackageJson, tsFiles) => {
          // Ensure at least one Go marker and one TS marker
          const hasGoMarker = hasGoMod || goFiles.length > 0;
          const hasTsMarker = hasPackageJson || tsFiles.length > 0;

          // Skip if we don't have both markers
          if (!hasGoMarker || !hasTsMarker) {
            return;
          }

          const testDir = await createTestDir();
          try {
            // Create Go markers
            if (hasGoMod) {
              await writeFile(
                join(testDir, GO_MARKERS.GO_MOD),
                "module test\n\ngo 1.21"
              );
            }
            const uniqueGoFiles = [...new Set(goFiles)];
            for (const goFile of uniqueGoFiles) {
              await writeFile(
                join(testDir, goFile),
                "package main\n\nfunc main() {}"
              );
            }

            // Create TypeScript markers
            if (hasPackageJson) {
              await writeFile(
                join(testDir, TS_MARKERS.PACKAGE_JSON),
                '{"name": "test"}'
              );
            }
            const uniqueTsFiles = [...new Set(tsFiles)].filter(
              (f) => !uniqueGoFiles.includes(f)
            );
            for (const tsFile of uniqueTsFiles) {
              await writeFile(join(testDir, tsFile), "export const x = 1;");
            }

            const result = await detect(testDir);

            expect(result.hasGo).toBe(true);
            expect(result.hasTypeScript).toBe(true);
            expect(result.goRoot).toBe(testDir);
            expect(result.tsRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.7: Detection accuracy with varying file counts
   *
   * For any directory configuration with varying numbers of Go and TypeScript files,
   * the detector SHALL correctly identify the presence of each language based on
   * whether any markers exist, regardless of the file count.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it("should correctly detect languages regardless of file count", async () => {
    await fc.assert(
      fc.asyncProperty(
        directoryConfigArb,
        goModContentArb,
        packageJsonContentArb,
        fc.array(goFileNameArb, { minLength: 10, maxLength: 10 }),
        fc.array(tsFileNameArb, { minLength: 10, maxLength: 10 }),
        fc.array(unrelatedFileNameArb, { minLength: 10, maxLength: 10 }),
        async (config, goModContent, packageJsonContent, goFiles, tsFiles, unrelatedFiles) => {
          const testDir = await createTestDir();
          try {
            // Ensure unique file names
            const uniqueGoFiles = [...new Set(goFiles)];
            const uniqueTsFiles = [...new Set(tsFiles)].filter(
              (f) => !uniqueGoFiles.includes(f)
            );
            const uniqueUnrelated = [...new Set(unrelatedFiles)].filter(
              (f) =>
                !uniqueGoFiles.includes(f) &&
                !uniqueTsFiles.includes(f) &&
                f !== "package.json"
            );

            await createDirectoryStructure(
              testDir,
              config,
              goModContent,
              packageJsonContent,
              uniqueGoFiles,
              uniqueTsFiles,
              uniqueUnrelated
            );

            const result = await detect(testDir);
            const expected = getExpectedResult(config);

            expect(result.hasGo).toBe(expected.expectedHasGo);
            expect(result.hasTypeScript).toBe(expected.expectedHasTypeScript);

            // Verify root paths are set correctly
            if (expected.expectedHasGo) {
              expect(result.goRoot).toBe(testDir);
            } else {
              expect(result.goRoot).toBeUndefined();
            }

            if (expected.expectedHasTypeScript) {
              expect(result.tsRoot).toBe(testDir);
            } else {
              expect(result.tsRoot).toBeUndefined();
            }
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.8: Detection is deterministic
   *
   * For any directory structure, calling detect multiple times SHALL
   * produce identical results.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it("should produce deterministic results for same directory structure", async () => {
    await fc.assert(
      fc.asyncProperty(
        directoryConfigArb,
        goModContentArb,
        packageJsonContentArb,
        fc.array(goFileNameArb, { minLength: 5, maxLength: 5 }),
        fc.array(tsFileNameArb, { minLength: 5, maxLength: 5 }),
        async (config, goModContent, packageJsonContent, goFiles, tsFiles) => {
          const testDir = await createTestDir();
          try {
            // Ensure unique file names
            const uniqueGoFiles = [...new Set(goFiles)];
            const uniqueTsFiles = [...new Set(tsFiles)].filter(
              (f) => !uniqueGoFiles.includes(f)
            );

            await createDirectoryStructure(
              testDir,
              config,
              goModContent,
              packageJsonContent,
              uniqueGoFiles,
              uniqueTsFiles,
              []
            );

            // Call detect multiple times
            const result1 = await detect(testDir);
            const result2 = await detect(testDir);
            const result3 = await detect(testDir);

            // All results should be identical
            expect(result1.hasGo).toBe(result2.hasGo);
            expect(result2.hasGo).toBe(result3.hasGo);
            expect(result1.hasTypeScript).toBe(result2.hasTypeScript);
            expect(result2.hasTypeScript).toBe(result3.hasTypeScript);
            expect(result1.goRoot).toBe(result2.goRoot);
            expect(result2.goRoot).toBe(result3.goRoot);
            expect(result1.tsRoot).toBe(result2.tsRoot);
            expect(result2.tsRoot).toBe(result3.tsRoot);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.9: go.mod takes precedence for Go detection
   *
   * For any directory containing go.mod, hasGo SHALL be true regardless
   * of whether .go files are present.
   *
   * **Validates: Requirement 1.3**
   */
  it("should detect Go via go.mod regardless of .go file presence", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModContentArb,
        fc.boolean(), // whether to include .go files
        fc.array(goFileNameArb, { minLength: 0, maxLength: 3 }),
        async (goModContent, includeGoFiles, goFiles) => {
          const testDir = await createTestDir();
          try {
            // Always create go.mod
            await writeFile(join(testDir, GO_MARKERS.GO_MOD), goModContent);

            // Optionally create .go files
            if (includeGoFiles && goFiles.length > 0) {
              const uniqueGoFiles = [...new Set(goFiles)];
              for (const goFile of uniqueGoFiles) {
                await writeFile(
                  join(testDir, goFile),
                  "package main\n\nfunc main() {}"
                );
              }
            }

            const result = await detect(testDir);

            // Should always detect Go when go.mod is present
            expect(result.hasGo).toBe(true);
            expect(result.goRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.10: package.json takes precedence for TypeScript detection
   *
   * For any directory containing package.json, hasTypeScript SHALL be true
   * regardless of whether .ts/.js files are present.
   *
   * **Validates: Requirement 1.4**
   */
  it("should detect TypeScript via package.json regardless of .ts/.js file presence", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageJsonContentArb,
        fc.boolean(), // whether to include .ts/.js files
        fc.array(tsFileNameArb, { minLength: 0, maxLength: 3 }),
        async (packageJsonContent, includeTsFiles, tsFiles) => {
          const testDir = await createTestDir();
          try {
            // Always create package.json
            await writeFile(
              join(testDir, TS_MARKERS.PACKAGE_JSON),
              packageJsonContent
            );

            // Optionally create .ts/.js files
            if (includeTsFiles && tsFiles.length > 0) {
              const uniqueTsFiles = [...new Set(tsFiles)];
              for (const tsFile of uniqueTsFiles) {
                await writeFile(join(testDir, tsFile), "export const x = 1;");
              }
            }

            const result = await detect(testDir);

            // Should always detect TypeScript when package.json is present
            expect(result.hasTypeScript).toBe(true);
            expect(result.tsRoot).toBe(testDir);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
