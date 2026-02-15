/**
 * Property-Based Tests for SCIP Indexing Tool
 *
 * Tests Property 2: Correct SCIP Tool Invocation
 * Tests Property 3: Multi-Language Package Handling
 *
 * Property 2: For any package with detected languages, the SCIP indexing tool
 * SHALL invoke scip-go for Go packages and scip-typescript for TypeScript packages,
 * with the tool selection being deterministic based on detected language.
 *
 * Property 3: For any package containing both Go and TypeScript code, the SCIP
 * indexing tool SHALL generate separate indexes for each language, with both
 * indexes present in the output.
 *
 * **Validates: Requirements 1.5, 1.6, 1.7**
 *
 * @see Design Document: Property 2: Correct SCIP Tool Invocation
 * @see Design Document: Property 3: Multi-Language Package Handling
 */

import * as fc from "fast-check";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateScipIndex } from "../../src/tools/scip_indexing.js";

// Increase timeout for tests that invoke external tools
const TOOL_INVOCATION_TIMEOUT = 30000; // 30 seconds per test

/**
 * Helper to create a unique temporary directory for each test run
 */
async function createTempDir(): Promise<string> {
  const tempDir = join(
    tmpdir(),
    `scip-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Helper to clean up temporary directory
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Arbitrary for generating valid Go module names
 */
const goModuleNameArb = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    { minLength: 1, maxLength: 15 }
  )
  .filter((s) => /^[a-z]/.test(s))
  .map((s) => `example.com/${s}`);

/**
 * Arbitrary for generating valid TypeScript/JavaScript package names
 */
const npmPackageNameArb = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    { minLength: 1, maxLength: 15 }
  )
  .filter((s) => /^[a-z]/.test(s));

/**
 * Arbitrary for generating valid variable names
 */
const variableNameArb = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
    { minLength: 1, maxLength: 10 }
  )
  .filter((s) => /^[a-zA-Z]/.test(s));

/**
 * Generate a minimal valid Go source file
 */
function generateGoSource(functionName: string): string {
  return `package main

func ${functionName}() {}

func main() {
    ${functionName}()
}
`;
}

/**
 * Generate a minimal valid TypeScript source file
 */
function generateTypeScriptSource(variableName: string): string {
  return `export const ${variableName} = 1;
`;
}

describe("Feature: documentation-tools, Property 3: Multi-Language Package Handling", () => {
  /**
   * Property 3.1: Multi-language packages generate separate indexes for each language
   *
   * For any package containing both Go and TypeScript code, the SCIP indexing tool
   * SHALL generate separate indexes for each language, with both indexes present
   * in the output.
   *
   * **Validates: Requirement 1.7**
   */
  it("should generate separate indexes for packages with both Go and TypeScript", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModuleNameArb,
        npmPackageNameArb,
        variableNameArb,
        variableNameArb,
        async (goModuleName, tsPackageName, funcName, varName) => {
          const tempDir = await createTempDir();
          try {
            // Create a multi-language package with both Go and TypeScript
            await writeFile(join(tempDir, "go.mod"), `module ${goModuleName}\n\ngo 1.21\n`);
            await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));
            await writeFile(
              join(tempDir, "package.json"),
              JSON.stringify({ name: tsPackageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));

            const result = await generateScipIndex({ packagePath: tempDir });

            // Both languages should be detected
            expect(result.languagesDetected).toContain("go");
            expect(result.languagesDetected).toContain("typescript");
            expect(result.languagesDetected.length).toBe(2);

            // If indexing succeeded for both languages, verify separate indexes
            const goIndex = result.indexes.find((i) => i.language === "go");
            const tsIndex = result.indexes.find((i) => i.language === "typescript");

            // Both indexes should be present in output (or have errors explaining why not)
            if (goIndex && tsIndex) {
              // Verify separate index files with correct naming convention
              expect(goIndex.indexPath).toContain("index.go.scip");
              expect(tsIndex.indexPath).toContain("index.ts.scip");
              
              // Verify they are different files
              expect(goIndex.indexPath).not.toBe(tsIndex.indexPath);
              
              // Verify each index has valid properties
              expect(goIndex.hash).toBeDefined();
              expect(goIndex.hash.length).toBe(64); // SHA-256 hex length
              expect(tsIndex.hash).toBeDefined();
              expect(tsIndex.hash.length).toBe(64);
              
              expect(goIndex.symbolCount).toBeGreaterThanOrEqual(0);
              expect(tsIndex.symbolCount).toBeGreaterThanOrEqual(0);
            }

            // If there are errors, they should be for specific tools, not general failures
            if (result.errors && result.errors.length > 0) {
              // Errors should mention specific tools (scip-go or scip-typescript)
              for (const error of result.errors) {
                expect(
                  error.includes("scip-go") || error.includes("scip-typescript")
                ).toBe(true);
              }
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocations
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 3.2: Both indexes are present in output for multi-language packages
   *
   * For any multi-language package, when both SCIP tools succeed, the output SHALL
   * contain exactly two indexes - one for Go and one for TypeScript.
   *
   * **Validates: Requirement 1.7**
   */
  it("should have both indexes present in output when both tools succeed", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModuleNameArb,
        npmPackageNameArb,
        variableNameArb,
        variableNameArb,
        async (goModuleName, tsPackageName, funcName, varName) => {
          const tempDir = await createTempDir();
          try {
            // Create a multi-language package
            await writeFile(join(tempDir, "go.mod"), `module ${goModuleName}\n\ngo 1.21\n`);
            await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));
            await writeFile(
              join(tempDir, "package.json"),
              JSON.stringify({ name: tsPackageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));

            const result = await generateScipIndex({ packagePath: tempDir });

            // Count successful indexes by language
            const goIndexes = result.indexes.filter((i) => i.language === "go");
            const tsIndexes = result.indexes.filter((i) => i.language === "typescript");

            // If both tools succeeded, we should have exactly one index per language
            if (goIndexes.length > 0 && tsIndexes.length > 0) {
              expect(goIndexes.length).toBe(1);
              expect(tsIndexes.length).toBe(1);
              expect(result.indexes.length).toBe(2);
            }

            // Verify that detected languages match the indexes we got (or have errors)
            for (const lang of result.languagesDetected) {
              const hasIndex = result.indexes.some((i) => i.language === lang);
              const hasError = result.errors?.some((e) => 
                (lang === "go" && e.includes("scip-go")) ||
                (lang === "typescript" && e.includes("scip-typescript"))
              );
              // Each detected language should either have an index or an error
              expect(hasIndex || hasError).toBe(true);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocations
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 3.3: Multi-language naming convention is used only for multi-language packages
   *
   * For any package with both Go and TypeScript, the index files SHALL use the
   * multi-language naming convention (index.go.scip, index.ts.scip) rather than
   * the single-language convention (index.scip).
   *
   * **Validates: Requirement 1.7, 1.8**
   */
  it("should use multi-language naming convention for multi-language packages", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModuleNameArb,
        npmPackageNameArb,
        variableNameArb,
        variableNameArb,
        async (goModuleName, tsPackageName, funcName, varName) => {
          const tempDir = await createTempDir();
          try {
            // Create a multi-language package
            await writeFile(join(tempDir, "go.mod"), `module ${goModuleName}\n\ngo 1.21\n`);
            await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));
            await writeFile(
              join(tempDir, "package.json"),
              JSON.stringify({ name: tsPackageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));

            const result = await generateScipIndex({ packagePath: tempDir });

            // For multi-language packages, verify naming convention
            for (const index of result.indexes) {
              if (index.language === "go") {
                // Go index should use .go.scip extension for multi-language
                expect(index.indexPath).toMatch(/index\.go\.scip$/);
                // Should NOT use plain index.scip
                expect(index.indexPath).not.toMatch(/[^.]index\.scip$/);
              } else if (index.language === "typescript") {
                // TypeScript index should use .ts.scip extension for multi-language
                expect(index.indexPath).toMatch(/index\.ts\.scip$/);
                // Should NOT use plain index.scip
                expect(index.indexPath).not.toMatch(/[^.]index\.scip$/);
              }
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocations
    );
  }, TOOL_INVOCATION_TIMEOUT);
});

describe("Feature: documentation-tools, Property 2: Correct SCIP Tool Invocation", () => {
  /**
   * Property 2.1: scip-go is invoked for Go packages
   *
   * For any package containing Go markers (go.mod or .go files), the SCIP indexing
   * tool SHALL detect Go and include 'go' in languagesDetected, indicating that
   * scip-go would be invoked for indexing.
   *
   * **Validates: Requirement 1.5**
   */
  it("should invoke scip-go for Go packages (detect Go language)", async () => {
    await fc.assert(
      fc.asyncProperty(
        goModuleNameArb,
        variableNameArb,
        fc.boolean(), // hasGoMod
        async (moduleName, funcName, hasGoMod) => {
          const tempDir = await createTempDir();
          try {
            // Create a Go package with either go.mod or .go files
            if (hasGoMod) {
              await writeFile(join(tempDir, "go.mod"), `module ${moduleName}\n\ngo 1.21\n`);
            }
            await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));

            const result = await generateScipIndex({ packagePath: tempDir });

            // Go should be detected - this means scip-go would be invoked
            expect(result.languagesDetected).toContain("go");
            
            // If indexing succeeded, verify the index is for Go
            const goIndex = result.indexes.find((i) => i.language === "go");
            if (goIndex) {
              expect(goIndex.language).toBe("go");
            }
            
            // If there are errors, they should mention scip-go (the tool being invoked)
            if (result.errors && result.errors.length > 0) {
              const goErrors = result.errors.filter((e) => e.includes("scip-go"));
              // At least one error should mention scip-go for Go packages
              expect(goErrors.length).toBeGreaterThan(0);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 2.2: scip-typescript is invoked for TypeScript packages
   *
   * For any package containing TypeScript markers (package.json or .ts/.js files),
   * the SCIP indexing tool SHALL detect TypeScript and include 'typescript' in
   * languagesDetected, indicating that scip-typescript would be invoked for indexing.
   *
   * **Validates: Requirement 1.6**
   */
  it("should invoke scip-typescript for TypeScript packages (detect TypeScript language)", async () => {
    await fc.assert(
      fc.asyncProperty(
        npmPackageNameArb,
        variableNameArb,
        fc.boolean(), // hasPackageJson
        fc.constantFrom(".ts", ".js"), // file extension
        async (packageName, varName, hasPackageJson, ext) => {
          const tempDir = await createTempDir();
          try {
            // Create a TypeScript/JavaScript package
            if (hasPackageJson) {
              await writeFile(
                join(tempDir, "package.json"),
                JSON.stringify({ name: packageName, version: "1.0.0" })
              );
            }
            await writeFile(join(tempDir, `index${ext}`), generateTypeScriptSource(varName));

            const result = await generateScipIndex({ packagePath: tempDir });

            // TypeScript should be detected - this means scip-typescript would be invoked
            expect(result.languagesDetected).toContain("typescript");
            
            // If indexing succeeded, verify the index is for TypeScript
            const tsIndex = result.indexes.find((i) => i.language === "typescript");
            if (tsIndex) {
              expect(tsIndex.language).toBe("typescript");
            }
            
            // If there are errors, they should mention scip-typescript (the tool being invoked)
            if (result.errors && result.errors.length > 0) {
              const tsErrors = result.errors.filter((e) => e.includes("scip-typescript"));
              // At least one error should mention scip-typescript for TS packages
              expect(tsErrors.length).toBeGreaterThan(0);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 2.3: Tool selection is deterministic based on detected language
   *
   * For any package with detected languages, invoking generateScipIndex multiple times
   * SHALL produce the same languagesDetected array, demonstrating that tool selection
   * (scip-go vs scip-typescript) is deterministic based on the detected language.
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it("should select tools deterministically based on detected language", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hasGo: fc.boolean(),
          hasTypeScript: fc.boolean(),
          goModuleName: goModuleNameArb,
          tsPackageName: npmPackageNameArb,
          funcName: variableNameArb,
          varName: variableNameArb,
        }),
        async ({ hasGo, hasTypeScript, goModuleName, tsPackageName, funcName, varName }) => {
          // Skip if no languages selected
          if (!hasGo && !hasTypeScript) {
            return;
          }

          const tempDir = await createTempDir();
          try {
            // Create package with selected languages
            if (hasGo) {
              await writeFile(join(tempDir, "go.mod"), `module ${goModuleName}\n\ngo 1.21\n`);
              await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));
            }
            if (hasTypeScript) {
              await writeFile(
                join(tempDir, "package.json"),
                JSON.stringify({ name: tsPackageName, version: "1.0.0" })
              );
              await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));
            }

            // Invoke multiple times to verify determinism
            const result1 = await generateScipIndex({ packagePath: tempDir });
            const result2 = await generateScipIndex({ packagePath: tempDir });
            const result3 = await generateScipIndex({ packagePath: tempDir });

            // All results should have identical languagesDetected (deterministic tool selection)
            expect(result1.languagesDetected.sort()).toEqual(result2.languagesDetected.sort());
            expect(result2.languagesDetected.sort()).toEqual(result3.languagesDetected.sort());

            // Verify expected languages are detected (correct tool would be invoked)
            if (hasGo) {
              expect(result1.languagesDetected).toContain("go");
            } else {
              expect(result1.languagesDetected).not.toContain("go");
            }
            if (hasTypeScript) {
              expect(result1.languagesDetected).toContain("typescript");
            } else {
              expect(result1.languagesDetected).not.toContain("typescript");
            }

            // Verify index results match detected languages
            for (const index of result1.indexes) {
              expect(result1.languagesDetected).toContain(index.language);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to multiple external tool invocations per iteration
    );
  }, TOOL_INVOCATION_TIMEOUT * 2); // Double timeout since this test invokes tools 3x per iteration
});


describe("Feature: documentation-tools, Property 4: Index Output Location Consistency", () => {
  /**
   * Property 4.1: SCIP index files are written to .archon/scip directory
   *
   * For any successfully indexed package, the SCIP index files SHALL be written
   * to `<package>/.archon/scip/` directory.
   *
   * **Validates: Requirement 1.8**
   */
  it("should write SCIP index files to .archon/scip directory", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Go-only package
          fc.record({
            type: fc.constant("go" as const),
            moduleName: goModuleNameArb,
            funcName: variableNameArb,
          }),
          // TypeScript-only package
          fc.record({
            type: fc.constant("typescript" as const),
            packageName: npmPackageNameArb,
            varName: variableNameArb,
          })
        ),
        async (packageConfig) => {
          const tempDir = await createTempDir();
          try {
            // Create package based on type
            if (packageConfig.type === "go") {
              await writeFile(
                join(tempDir, "go.mod"),
                `module ${packageConfig.moduleName}\n\ngo 1.21\n`
              );
              await writeFile(
                join(tempDir, "main.go"),
                generateGoSource(packageConfig.funcName)
              );
            } else {
              await writeFile(
                join(tempDir, "package.json"),
                JSON.stringify({ name: packageConfig.packageName, version: "1.0.0" })
              );
              await writeFile(
                join(tempDir, "index.ts"),
                generateTypeScriptSource(packageConfig.varName)
              );
            }

            const result = await generateScipIndex({ packagePath: tempDir });

            // All index files should be in .archon/scip directory
            for (const index of result.indexes) {
              expect(index.indexPath).toContain(".archon");
              expect(index.indexPath).toContain("scip");
              expect(index.indexPath).toMatch(/\.archon[\/\\]scip[\/\\]/);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 4.2: Consistent naming conventions for index files
   *
   * For any successfully indexed package, the SCIP index files SHALL follow
   * consistent naming conventions: `index.scip` for single-language packages,
   * `index.go.scip` and `index.ts.scip` for multi-language packages.
   *
   * **Validates: Requirement 1.8**
   */
  it("should use consistent naming conventions for index files", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hasGo: fc.boolean(),
          hasTypeScript: fc.boolean(),
          goModuleName: goModuleNameArb,
          tsPackageName: npmPackageNameArb,
          funcName: variableNameArb,
          varName: variableNameArb,
        }),
        async ({ hasGo, hasTypeScript, goModuleName, tsPackageName, funcName, varName }) => {
          // Skip if no languages selected
          if (!hasGo && !hasTypeScript) {
            return;
          }

          const tempDir = await createTempDir();
          try {
            // Create package with selected languages
            if (hasGo) {
              await writeFile(join(tempDir, "go.mod"), `module ${goModuleName}\n\ngo 1.21\n`);
              await writeFile(join(tempDir, "main.go"), generateGoSource(funcName));
            }
            if (hasTypeScript) {
              await writeFile(
                join(tempDir, "package.json"),
                JSON.stringify({ name: tsPackageName, version: "1.0.0" })
              );
              await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));
            }

            const result = await generateScipIndex({ packagePath: tempDir });
            const isMultiLanguage = hasGo && hasTypeScript;

            for (const index of result.indexes) {
              if (isMultiLanguage) {
                // Multi-language: should use language-specific naming
                if (index.language === "go") {
                  expect(index.indexPath).toMatch(/index\.go\.scip$/);
                } else if (index.language === "typescript") {
                  expect(index.indexPath).toMatch(/index\.ts\.scip$/);
                }
              } else {
                // Single-language: should use generic naming
                expect(index.indexPath).toMatch(/index\.scip$/);
                // Should NOT have language-specific extension
                expect(index.indexPath).not.toMatch(/index\.(go|ts)\.scip$/);
              }
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 4.3: Index path is absolute and within package directory
   *
   * For any successfully indexed package, the index path SHALL be an absolute
   * path that is within the package directory structure.
   *
   * **Validates: Requirement 1.8**
   */
  it("should return absolute index paths within package directory", async () => {
    await fc.assert(
      fc.asyncProperty(
        npmPackageNameArb,
        variableNameArb,
        async (packageName, varName) => {
          const tempDir = await createTempDir();
          try {
            // Create a TypeScript package
            await writeFile(
              join(tempDir, "package.json"),
              JSON.stringify({ name: packageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));

            const result = await generateScipIndex({ packagePath: tempDir });

            for (const index of result.indexes) {
              // Path should be absolute (starts with / on Unix or drive letter on Windows)
              const isAbsolute = index.indexPath.startsWith("/") || /^[A-Za-z]:/.test(index.indexPath);
              expect(isAbsolute).toBe(true);

              // Path should be within the package directory
              // Normalize paths for comparison
              const normalizedIndexPath = index.indexPath.replace(/\\/g, "/");
              const normalizedTempDir = tempDir.replace(/\\/g, "/");
              expect(normalizedIndexPath.startsWith(normalizedTempDir)).toBe(true);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);
});

describe("Feature: documentation-tools, Property 5: Index Hash Determinism", () => {
  /**
   * Property 5.1: Hash computation is deterministic
   *
   * For any SCIP index content, computing the hash multiple times SHALL produce
   * identical hash values.
   *
   * **Validates: Requirement 1.9**
   */
  it("should produce identical hash values for same index content", async () => {
    await fc.assert(
      fc.asyncProperty(
        npmPackageNameArb,
        variableNameArb,
        async (packageName, varName) => {
          const tempDir = await createTempDir();
          try {
            // Create a TypeScript package
            await writeFile(
              join(tempDir, "package.json"),
              JSON.stringify({ name: packageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir, "index.ts"), generateTypeScriptSource(varName));

            // Generate index multiple times (force=true to ensure regeneration)
            const result1 = await generateScipIndex({ packagePath: tempDir, force: true });
            
            // Without force, should reuse existing index and get same hash
            const result2 = await generateScipIndex({ packagePath: tempDir });
            const result3 = await generateScipIndex({ packagePath: tempDir });

            // All hashes should be identical for the same content
            if (result1.indexes.length > 0 && result2.indexes.length > 0 && result3.indexes.length > 0) {
              const hash1 = result1.indexes[0].hash;
              const hash2 = result2.indexes[0].hash;
              const hash3 = result3.indexes[0].hash;

              expect(hash1).toBe(hash2);
              expect(hash2).toBe(hash3);

              // Hash should be valid SHA-256 (64 hex characters)
              expect(hash1).toMatch(/^[a-f0-9]{64}$/);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 5.2: Different content produces different hashes
   *
   * For any two packages with different source content, the generated SCIP indexes
   * SHALL have different hash values (with high probability).
   *
   * **Validates: Requirement 1.9**
   */
  it("should produce different hashes for different content", async () => {
    await fc.assert(
      fc.asyncProperty(
        npmPackageNameArb,
        variableNameArb,
        variableNameArb,
        async (packageName, varName1, varName2) => {
          // Ensure different variable names
          if (varName1 === varName2) {
            return; // Skip this iteration
          }

          const tempDir1 = await createTempDir();
          const tempDir2 = await createTempDir();
          try {
            // Create two packages with different content
            await writeFile(
              join(tempDir1, "package.json"),
              JSON.stringify({ name: packageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir1, "index.ts"), generateTypeScriptSource(varName1));

            await writeFile(
              join(tempDir2, "package.json"),
              JSON.stringify({ name: packageName, version: "1.0.0" })
            );
            await writeFile(join(tempDir2, "index.ts"), generateTypeScriptSource(varName2));

            const result1 = await generateScipIndex({ packagePath: tempDir1 });
            const result2 = await generateScipIndex({ packagePath: tempDir2 });

            // If both succeeded, hashes should be different
            if (result1.indexes.length > 0 && result2.indexes.length > 0) {
              const hash1 = result1.indexes[0].hash;
              const hash2 = result2.indexes[0].hash;

              // Different content should produce different hashes
              expect(hash1).not.toBe(hash2);
            }
          } finally {
            await cleanupTempDir(tempDir1);
            await cleanupTempDir(tempDir2);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);

  /**
   * Property 5.3: Hash is valid SHA-256 format
   *
   * For any successfully generated SCIP index, the hash SHALL be a valid
   * SHA-256 hash (64 hexadecimal characters).
   *
   * **Validates: Requirement 1.9**
   */
  it("should produce valid SHA-256 hash format", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Go package
          fc.record({
            type: fc.constant("go" as const),
            moduleName: goModuleNameArb,
            funcName: variableNameArb,
          }),
          // TypeScript package
          fc.record({
            type: fc.constant("typescript" as const),
            packageName: npmPackageNameArb,
            varName: variableNameArb,
          })
        ),
        async (packageConfig) => {
          const tempDir = await createTempDir();
          try {
            // Create package based on type
            if (packageConfig.type === "go") {
              await writeFile(
                join(tempDir, "go.mod"),
                `module ${packageConfig.moduleName}\n\ngo 1.21\n`
              );
              await writeFile(
                join(tempDir, "main.go"),
                generateGoSource(packageConfig.funcName)
              );
            } else {
              await writeFile(
                join(tempDir, "package.json"),
                JSON.stringify({ name: packageConfig.packageName, version: "1.0.0" })
              );
              await writeFile(
                join(tempDir, "index.ts"),
                generateTypeScriptSource(packageConfig.varName)
              );
            }

            const result = await generateScipIndex({ packagePath: tempDir });

            // All hashes should be valid SHA-256 format
            for (const index of result.indexes) {
              // SHA-256 produces 64 hexadecimal characters
              expect(index.hash).toMatch(/^[a-f0-9]{64}$/);
              expect(index.hash.length).toBe(64);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 20 } // Reduced iterations due to external tool invocation
    );
  }, TOOL_INVOCATION_TIMEOUT);
});
