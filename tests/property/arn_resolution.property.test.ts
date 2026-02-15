/**
 * Property-Based Tests for ARN Resolution Tool
 *
 * Tests Property 17: ARN Resolution Correctness
 *
 * Property 17: For any valid ARN pointing to an existing resource, resolution SHALL
 * return the correct file path, line number, and symbol information. For any ARN
 * pointing to a non-existent resource, resolution SHALL return an appropriate error.
 * Both code and doc ARN types SHALL be resolvable.
 *
 * **Validates: Requirements 5.3, 5.4, 5.5**
 *
 * @see Design Document: Property 17: ARN Resolution Correctness
 */

import * as fc from "fast-check";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveArn, convertToArchonDocPath } from "../../src/tools/arn_resolution.js";
import { generate } from "../../src/lib/arn.js";
import type { ArnComponents, ArnType } from "../../src/types/arn.js";

/**
 * Valid ARN types for resolution testing
 */
const VALID_ARN_TYPES: ArnType[] = ["code", "doc"];

/**
 * Common file extensions for source files
 */
const FILE_EXTENSIONS = [".ts", ".js", ".tsx", ".jsx", ".go", ".py"];

/**
 * Arbitrary for generating valid ARN types (code and doc only for resolution)
 */
const arnTypeArb = fc.constantFrom(...VALID_ARN_TYPES);

/**
 * Arbitrary for generating valid workspace names
 */
const workspaceArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("")
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0);


/**
 * Arbitrary for generating valid package names
 */
const packageArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("")
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0 && !s.startsWith("-"));

/**
 * Arbitrary for generating valid directory names
 */
const directoryNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("")
    ),
    { minLength: 1, maxLength: 15 }
  )
  .filter((s) => s.length > 0 && !s.startsWith("-"));

/**
 * Arbitrary for generating valid file names (without extension)
 */
const fileNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split("")
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0 && /^[a-zA-Z_]/.test(s));

/**
 * Arbitrary for generating file extensions
 */
const extensionArb = fc.constantFrom(...FILE_EXTENSIONS);

/**
 * Arbitrary for generating directory paths with variable depth (0-5 levels)
 */
const directoryPathArb = fc
  .array(directoryNameArb, { minLength: 0, maxLength: 5 })
  .map((segments) => (segments.length > 0 ? segments.join("/") : ""));

/**
 * Arbitrary for generating complete source file paths
 */
const sourceFilePathArb = fc
  .tuple(directoryPathArb, fileNameArb, extensionArb)
  .map(([dir, name, ext]) => {
    if (dir.length > 0) {
      return `${dir}/${name}${ext}`;
    }
    return `${name}${ext}`;
  });

/**
 * Arbitrary for generating valid symbol names
 */
const symbolNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split("")
    ),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => s.length > 0 && /^[a-zA-Z_]/.test(s));

/**
 * Arbitrary for generating optional symbol (undefined or valid symbol)
 */
const optionalSymbolArb = fc.option(symbolNameArb, { nil: undefined });


/**
 * Test context for managing temporary directories
 */
interface TestContext {
  testDir: string;
}

/**
 * Create a unique temporary directory for testing
 */
async function createTestDir(): Promise<string> {
  const testDir = join(
    tmpdir(),
    `arn-resolution-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Clean up a temporary directory
 */
async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a test package with source files
 */
async function createTestPackage(
  testDir: string,
  packageName: string,
  files: { path: string; content: string }[]
): Promise<string> {
  const packagePath = join(testDir, packageName);
  await mkdir(packagePath, { recursive: true });

  for (const file of files) {
    const filePath = join(packagePath, file.path);
    const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (fileDir !== packagePath && fileDir.length > 0) {
      await mkdir(fileDir, { recursive: true });
    }
    await writeFile(filePath, file.content);
  }

  return packagePath;
}

/**
 * Generate sample source code content based on file extension
 */
function generateSourceContent(fileName: string, symbolName?: string): string {
  const ext = fileName.substring(fileName.lastIndexOf("."));
  const symbol = symbolName || "main";

  switch (ext) {
    case ".ts":
    case ".tsx":
      return `export const ${symbol} = () => {};\nexport function helper() { return 42; }`;
    case ".js":
    case ".jsx":
      return `module.exports.${symbol} = () => {};\nfunction helper() { return 42; }`;
    case ".go":
      return `package main\n\nfunc ${symbol}() {}\nfunc helper() int { return 42 }`;
    case ".py":
      return `def ${symbol}():\n    pass\n\ndef helper():\n    return 42`;
    default:
      return `// ${symbol}`;
  }
}


// ============================================================================
// Property 17: ARN Resolution Correctness
// ============================================================================

describe("Feature: documentation-tools, Property 17: ARN Resolution Correctness", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  // ==========================================================================
  // Property 17.1: Code ARN resolution returns correct file path
  // ==========================================================================

  /**
   * Property 17.1: For any valid code ARN pointing to an existing file,
   * resolution SHALL return the correct file path.
   *
   * **Validates: Requirement 5.3**
   */
  it("should resolve code ARN to correct file path for existing files", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        optionalSymbolArb,
        async (workspace, pkg, filePath, symbol) => {
          // Create the test package with the source file
          await createTestPackage(testDir, pkg, [
            { path: filePath, content: generateSourceContent(filePath, symbol) },
          ]);

          // Generate the ARN
          const components: ArnComponents = {
            type: "code",
            workspace,
            package: pkg,
            path: filePath,
            symbol,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify resolution succeeds
          expect(result.success).toBe(true);
          expect(result.resolved).not.toBeNull();

          // Verify the resolved file path contains the expected components
          expect(result.resolved!.filePath).toContain(pkg);
          expect(result.resolved!.filePath).toContain(filePath.split("/").pop()!);

          // Verify the resolved type is correct
          expect(result.resolved!.type).toBe("code");

          // Verify the resolved components match the input
          expect(result.resolved!.workspace).toBe(workspace);
          expect(result.resolved!.package).toBe(pkg);
          expect(result.resolved!.path).toBe(filePath);

          // Verify symbol is preserved if provided
          if (symbol) {
            expect(result.resolved!.symbol).toBe(symbol);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.2: Doc ARN resolution returns correct file path
  // ==========================================================================

  /**
   * Property 17.2: For any valid doc ARN pointing to an existing .archon.md file,
   * resolution SHALL return the correct file path.
   *
   * **Validates: Requirement 5.5**
   */
  it("should resolve doc ARN to correct .archon.md file path for existing files", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        async (workspace, pkg, sourcePath) => {
          // Convert source path to .archon.md path
          const docPath = convertToArchonDocPath(sourcePath);

          // Create the test package with the documentation file
          await createTestPackage(testDir, pkg, [
            { path: docPath, content: `# Documentation for ${sourcePath}` },
          ]);

          // Generate the ARN (using source path, which will be converted to doc path)
          const components: ArnComponents = {
            type: "doc",
            workspace,
            package: pkg,
            path: sourcePath,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify resolution succeeds
          expect(result.success).toBe(true);
          expect(result.resolved).not.toBeNull();

          // Verify the resolved file path ends with .archon.md
          expect(result.resolved!.filePath).toContain(".archon.md");

          // Verify the resolved type is correct
          expect(result.resolved!.type).toBe("doc");

          // Verify the resolved components match the input
          expect(result.resolved!.workspace).toBe(workspace);
          expect(result.resolved!.package).toBe(pkg);
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.3: Non-existent resources return appropriate error
  // ==========================================================================

  /**
   * Property 17.3: For any ARN pointing to a non-existent resource,
   * resolution SHALL return an appropriate error.
   *
   * **Validates: Requirement 5.4**
   */
  it("should return error for ARN pointing to non-existent code file", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        optionalSymbolArb,
        async (workspace, pkg, filePath, symbol) => {
          // Create an empty package (no files)
          await createTestPackage(testDir, pkg, []);

          // Generate the ARN for a non-existent file
          const components: ArnComponents = {
            type: "code",
            workspace,
            package: pkg,
            path: filePath,
            symbol,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify resolution fails with appropriate error
          expect(result.success).toBe(false);
          expect(result.resolved).toBeNull();
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
          expect(result.error!.toLowerCase()).toContain("not found");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.3b: For any doc ARN pointing to a non-existent .archon.md file,
   * resolution SHALL return an appropriate error.
   *
   * **Validates: Requirement 5.4**
   */
  it("should return error for ARN pointing to non-existent doc file", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        async (workspace, pkg, sourcePath) => {
          // Create an empty package (no files)
          await createTestPackage(testDir, pkg, []);

          // Generate the ARN for a non-existent doc file
          const components: ArnComponents = {
            type: "doc",
            workspace,
            package: pkg,
            path: sourcePath,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify resolution fails with appropriate error
          expect(result.success).toBe(false);
          expect(result.resolved).toBeNull();
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
          expect(result.error!.toLowerCase()).toContain("not found");
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.4: Resolution is deterministic
  // ==========================================================================

  /**
   * Property 17.4: Resolution is deterministic - same ARN always produces same result.
   *
   * **Validates: Requirements 5.3, 5.5**
   */
  it("should produce deterministic results for same ARN", async () => {
    await fc.assert(
      fc.asyncProperty(
        arnTypeArb,
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        optionalSymbolArb,
        async (type, workspace, pkg, filePath, symbol) => {
          // Create the appropriate file based on ARN type
          if (type === "code") {
            await createTestPackage(testDir, pkg, [
              { path: filePath, content: generateSourceContent(filePath, symbol) },
            ]);
          } else {
            const docPath = convertToArchonDocPath(filePath);
            await createTestPackage(testDir, pkg, [
              { path: docPath, content: `# Documentation` },
            ]);
          }

          // Generate the ARN
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path: filePath,
            symbol: type === "code" ? symbol : undefined,
          };
          const arn = generate(components);

          // Resolve the ARN multiple times
          const result1 = await resolveArn({ arn }, { workspaceBasePath: testDir });
          const result2 = await resolveArn({ arn }, { workspaceBasePath: testDir });
          const result3 = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // All results should be identical
          expect(result1.success).toBe(result2.success);
          expect(result2.success).toBe(result3.success);

          if (result1.success) {
            expect(result1.resolved!.filePath).toBe(result2.resolved!.filePath);
            expect(result2.resolved!.filePath).toBe(result3.resolved!.filePath);
            expect(result1.resolved!.type).toBe(result2.resolved!.type);
            expect(result2.resolved!.type).toBe(result3.resolved!.type);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.5: Both code and doc ARN types are resolvable
  // ==========================================================================

  /**
   * Property 17.5: Both code and doc ARN types SHALL be resolvable.
   *
   * **Validates: Requirement 5.5**
   */
  it("should resolve both code and doc ARN types for same source file", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        symbolNameArb,
        async (workspace, pkg, filePath, symbol) => {
          // Create both source file and documentation file
          const docPath = convertToArchonDocPath(filePath);
          await createTestPackage(testDir, pkg, [
            { path: filePath, content: generateSourceContent(filePath, symbol) },
            { path: docPath, content: `# Documentation for ${filePath}` },
          ]);

          // Generate code ARN
          const codeComponents: ArnComponents = {
            type: "code",
            workspace,
            package: pkg,
            path: filePath,
            symbol,
          };
          const codeArn = generate(codeComponents);

          // Generate doc ARN
          const docComponents: ArnComponents = {
            type: "doc",
            workspace,
            package: pkg,
            path: filePath,
          };
          const docArn = generate(docComponents);

          // Resolve both ARNs
          const codeResult = await resolveArn({ arn: codeArn }, { workspaceBasePath: testDir });
          const docResult = await resolveArn({ arn: docArn }, { workspaceBasePath: testDir });

          // Both should resolve successfully
          expect(codeResult.success).toBe(true);
          expect(docResult.success).toBe(true);

          // Code ARN should resolve to source file
          expect(codeResult.resolved!.type).toBe("code");
          expect(codeResult.resolved!.filePath).toContain(filePath.split("/").pop()!);

          // Doc ARN should resolve to .archon.md file
          expect(docResult.resolved!.type).toBe("doc");
          expect(docResult.resolved!.filePath).toContain(".archon.md");
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.6: convertToArchonDocPath correctness
  // ==========================================================================

  /**
   * Property 17.6: convertToArchonDocPath correctly converts source paths to doc paths.
   *
   * **Validates: Requirement 5.5**
   */
  it("should correctly convert source paths to .archon.md paths", () => {
    fc.assert(
      fc.property(sourceFilePathArb, (sourcePath) => {
        const docPath = convertToArchonDocPath(sourcePath);

        // Doc path should end with .archon.md
        expect(docPath.endsWith(".archon.md")).toBe(true);

        // Doc path should not have double extensions
        for (const ext of FILE_EXTENSIONS) {
          expect(docPath).not.toContain(`${ext}.archon.md`);
        }

        // Doc path should preserve directory structure
        const sourceDir = sourcePath.includes("/")
          ? sourcePath.substring(0, sourcePath.lastIndexOf("/"))
          : "";
        const docDir = docPath.includes("/")
          ? docPath.substring(0, docPath.lastIndexOf("/"))
          : "";
        expect(docDir).toBe(sourceDir);

        // Doc path should preserve base name
        const sourceBaseName = sourcePath
          .split("/")
          .pop()!
          .replace(/\.[^.]+$/, "");
        const docBaseName = docPath
          .split("/")
          .pop()!
          .replace(".archon.md", "");
        expect(docBaseName).toBe(sourceBaseName);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.6b: convertToArchonDocPath is idempotent for .archon.md paths.
   *
   * **Validates: Requirement 5.5**
   */
  it("should return .archon.md paths unchanged", () => {
    fc.assert(
      fc.property(sourceFilePathArb, (sourcePath) => {
        const docPath = convertToArchonDocPath(sourcePath);

        // Converting an already converted path should return the same result
        const doubleConverted = convertToArchonDocPath(docPath);
        expect(doubleConverted).toBe(docPath);
      }),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.7: Resolution preserves ARN components
  // ==========================================================================

  /**
   * Property 17.7: Resolution preserves all ARN components in the result.
   *
   * **Validates: Requirements 5.3, 5.5**
   */
  it("should preserve all ARN components in resolution result", async () => {
    await fc.assert(
      fc.asyncProperty(
        arnTypeArb,
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        optionalSymbolArb,
        async (type, workspace, pkg, filePath, symbol) => {
          // Create the appropriate file based on ARN type
          if (type === "code") {
            await createTestPackage(testDir, pkg, [
              { path: filePath, content: generateSourceContent(filePath, symbol) },
            ]);
          } else {
            const docPath = convertToArchonDocPath(filePath);
            await createTestPackage(testDir, pkg, [
              { path: docPath, content: `# Documentation` },
            ]);
          }

          // Generate the ARN
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path: filePath,
            symbol: type === "code" ? symbol : undefined,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify all components are preserved
          expect(result.success).toBe(true);
          expect(result.resolved).not.toBeNull();
          expect(result.resolved!.type).toBe(type);
          expect(result.resolved!.workspace).toBe(workspace);
          expect(result.resolved!.package).toBe(pkg);
          expect(result.resolved!.path).toBe(filePath);

          // Symbol should be preserved for code ARNs
          if (type === "code" && symbol) {
            expect(result.resolved!.symbol).toBe(symbol);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.8: Resolution returns absolute file paths
  // ==========================================================================

  /**
   * Property 17.8: Resolution returns absolute file paths.
   *
   * **Validates: Requirement 5.3**
   */
  it("should return absolute file paths in resolution result", async () => {
    await fc.assert(
      fc.asyncProperty(
        arnTypeArb,
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        async (type, workspace, pkg, filePath) => {
          // Create the appropriate file based on ARN type
          if (type === "code") {
            await createTestPackage(testDir, pkg, [
              { path: filePath, content: generateSourceContent(filePath) },
            ]);
          } else {
            const docPath = convertToArchonDocPath(filePath);
            await createTestPackage(testDir, pkg, [
              { path: docPath, content: `# Documentation` },
            ]);
          }

          // Generate the ARN
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path: filePath,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify the file path is absolute
          expect(result.success).toBe(true);
          expect(result.resolved).not.toBeNull();

          // Absolute paths start with / on Unix or drive letter on Windows
          const isAbsolute =
            result.resolved!.filePath.startsWith("/") ||
            /^[A-Za-z]:[\\/]/.test(result.resolved!.filePath);
          expect(isAbsolute).toBe(true);

          // The path should contain the test directory
          expect(result.resolved!.filePath).toContain(testDir.split("/").pop()!);
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.9: Error messages are descriptive
  // ==========================================================================

  /**
   * Property 17.9: Error messages for non-existent resources are descriptive.
   *
   * **Validates: Requirement 5.4**
   */
  it("should return descriptive error messages for non-existent resources", async () => {
    await fc.assert(
      fc.asyncProperty(
        arnTypeArb,
        workspaceArb,
        packageArb,
        sourceFilePathArb,
        async (type, workspace, pkg, filePath) => {
          // Create an empty package (no files)
          await createTestPackage(testDir, pkg, []);

          // Generate the ARN for a non-existent file
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path: filePath,
          };
          const arn = generate(components);

          // Resolve the ARN
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify error is descriptive
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);

          // Error should mention "not found" or similar
          expect(result.error!.toLowerCase()).toContain("not found");
        }
      ),
      { numRuns: 100 }
    );
  });


  // ==========================================================================
  // Property 17.10: Resolution handles various file extensions
  // ==========================================================================

  /**
   * Property 17.10: Resolution handles various file extensions correctly.
   *
   * **Validates: Requirements 5.3, 5.5**
   */
  it("should resolve ARNs for files with various extensions", async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceArb,
        packageArb,
        directoryPathArb,
        fileNameArb,
        extensionArb,
        async (workspace, pkg, dirPath, fileName, ext) => {
          const filePath = dirPath.length > 0 ? `${dirPath}/${fileName}${ext}` : `${fileName}${ext}`;

          // Create the source file
          await createTestPackage(testDir, pkg, [
            { path: filePath, content: generateSourceContent(filePath) },
          ]);

          // Generate and resolve code ARN
          const components: ArnComponents = {
            type: "code",
            workspace,
            package: pkg,
            path: filePath,
          };
          const arn = generate(components);
          const result = await resolveArn({ arn }, { workspaceBasePath: testDir });

          // Verify resolution succeeds
          expect(result.success).toBe(true);
          expect(result.resolved).not.toBeNull();
          expect(result.resolved!.filePath).toContain(fileName);
          expect(result.resolved!.filePath).toContain(ext);
        }
      ),
      { numRuns: 100 }
    );
  });
});
