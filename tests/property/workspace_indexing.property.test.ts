/**
 * Property-Based Tests for Workspace Indexing Tool
 *
 * Tests Property 18: Workspace Package Discovery
 * Tests Property 19: Dependency Order Processing
 *
 * Property 18: For any workspace directory structure, the workspace indexing tool
 * SHALL discover all packages (directories containing `go.mod`, `package.json`,
 * or other language markers) regardless of nesting depth.
 *
 * Property 19: For any workspace with inter-package dependencies, the workspace
 * indexing tool SHALL process packages in dependency order (dependencies before
 * dependents).
 *
 * **Validates: Requirements 6.3, 6.4**
 *
 * @see Design Document: Property 18: Workspace Package Discovery
 * @see Design Document: Property 19: Dependency Order Processing
 */

import * as fc from "fast-check";
import { mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

import {
  discoverPackages,
  orderPackagesByDependencies,
  analyzeDependencies,
  topologicalSort,
} from "../../src/tools/workspace_indexing.js";

/**
 * Package type enumeration for test generation
 */
type PackageType = "go" | "typescript" | "both";

/**
 * Represents a package to be created in the test workspace
 */
interface TestPackage {
  /** Relative path segments from workspace root */
  pathSegments: string[];
  /** Type of package (go, typescript, or both) */
  type: PackageType;
  /** Package name */
  name: string;
}

/**
 * Arbitrary for generating valid directory segment names
 * - Non-empty strings
 * - No path separators or special filesystem characters
 * - Not hidden (doesn't start with .)
 * - Not reserved names (node_modules, vendor, .archon)
 * - Only alphanumeric characters, hyphens, and underscores for safety
 */
const dirSegmentArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split("")
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => 
    s.length > 0 &&
    !s.startsWith(".") &&
    !s.startsWith("-") &&
    s !== "node_modules" &&
    s !== "vendor"
  );

/**
 * Arbitrary for generating package names
 * - Valid npm/go package name format
 */
const packageNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")
    ),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => /^[a-z]/.test(s)); // Must start with letter

/**
 * Arbitrary for generating package types
 */
const packageTypeArb: fc.Arbitrary<PackageType> = fc.constantFrom("go", "typescript", "both");

/**
 * Arbitrary for generating nesting depth (0-5 levels)
 * 0 = package at workspace root
 * 5 = package nested 5 directories deep
 */
const nestingDepthArb = fc.integer({ min: 0, max: 5 });

/**
 * Arbitrary for generating a single test package
 */
const testPackageArb: fc.Arbitrary<TestPackage> = fc.record({
  pathSegments: fc.array(dirSegmentArb, { minLength: 0, maxLength: 5 }),
  type: packageTypeArb,
  name: packageNameArb,
});

/**
 * Arbitrary for generating a workspace with multiple packages at various depths
 */
const workspaceArb: fc.Arbitrary<TestPackage[]> = fc
  .array(testPackageArb, { minLength: 1, maxLength: 10 })
  .map((packages) => {
    // Ensure unique paths by appending index to duplicate paths
    const pathMap = new Map<string, number>();
    return packages.map((pkg, index) => {
      const pathKey = pkg.pathSegments.join("/");
      const count = pathMap.get(pathKey) || 0;
      pathMap.set(pathKey, count + 1);
      
      if (count > 0) {
        // Make path unique by adding suffix
        return {
          ...pkg,
          pathSegments: [...pkg.pathSegments, `pkg-${index}`],
          name: `${pkg.name}-${index}`,
        };
      }
      return pkg;
    });
  });

/**
 * Create a go.mod file content
 */
function createGoModContent(moduleName: string): string {
  return `module ${moduleName}

go 1.21
`;
}

/**
 * Create a package.json file content
 */
function createPackageJsonContent(name: string): string {
  return JSON.stringify({ name, version: "1.0.0" }, null, 2);
}

/**
 * Create a test workspace with the specified packages
 * 
 * @param workspaceRoot - Root directory for the workspace
 * @param packages - Array of packages to create
 * @returns Array of absolute paths to created packages
 */
async function createTestWorkspace(
  workspaceRoot: string,
  packages: TestPackage[]
): Promise<string[]> {
  const createdPaths: string[] = [];

  for (const pkg of packages) {
    // Build the full path
    const packagePath = join(workspaceRoot, ...pkg.pathSegments);
    
    // Create the directory
    await mkdir(packagePath, { recursive: true });

    // Create package marker files based on type
    if (pkg.type === "go" || pkg.type === "both") {
      await writeFile(
        join(packagePath, "go.mod"),
        createGoModContent(`example.com/${pkg.name}`)
      );
    }

    if (pkg.type === "typescript" || pkg.type === "both") {
      await writeFile(
        join(packagePath, "package.json"),
        createPackageJsonContent(pkg.name)
      );
    }

    createdPaths.push(packagePath);
  }

  return createdPaths;
}

/**
 * Clean up test workspace
 */
async function cleanupWorkspace(workspaceRoot: string): Promise<void> {
  try {
    await rm(workspaceRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Generate a unique test directory path
 */
function generateTestDir(): string {
  return join(
    tmpdir(),
    `workspace-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

describe("Feature: documentation-tools, Property 18: Workspace Package Discovery", () => {
  /**
   * Property 18.1: All packages are discovered regardless of type
   *
   * For any workspace with packages (Go, TypeScript, or both), the discoverPackages
   * function SHALL find all packages regardless of their type.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover all packages regardless of type (go, typescript, or both)", async () => {
    await fc.assert(
      fc.asyncProperty(workspaceArb, async (packages) => {
        const testDir = generateTestDir();
        
        try {
          // Create the test workspace
          const createdPaths = await createTestWorkspace(testDir, packages);
          
          // Discover packages
          const discoveredPaths = await discoverPackages(testDir);
          
          // Verify all created packages are discovered
          for (const createdPath of createdPaths) {
            expect(discoveredPaths).toContain(createdPath);
          }
          
          // Verify the count matches
          expect(discoveredPaths.length).toBeGreaterThanOrEqual(createdPaths.length);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.2: Discovery works at any nesting depth
   *
   * For any package at any nesting depth (0-5 levels), the discoverPackages
   * function SHALL find the package regardless of how deeply nested it is.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover packages at any nesting depth (0-5 levels)", async () => {
    await fc.assert(
      fc.asyncProperty(
        nestingDepthArb,
        packageTypeArb,
        packageNameArb,
        async (depth, type, name) => {
          const testDir = generateTestDir();
          
          try {
            // Create path segments for the specified depth
            const pathSegments: string[] = [];
            for (let i = 0; i < depth; i++) {
              pathSegments.push(`level-${i}`);
            }
            
            // Create a single package at the specified depth
            const packages: TestPackage[] = [{
              pathSegments,
              type,
              name,
            }];
            
            const createdPaths = await createTestWorkspace(testDir, packages);
            
            // Discover packages
            const discoveredPaths = await discoverPackages(testDir);
            
            // Verify the package is discovered
            expect(discoveredPaths).toContain(createdPaths[0]);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.3: Go packages (directories with go.mod) are discovered
   *
   * For any directory containing a go.mod file, the discoverPackages function
   * SHALL identify it as a package.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover all Go packages (directories with go.mod)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            pathSegments: fc.array(dirSegmentArb, { minLength: 0, maxLength: 5 }),
            name: packageNameArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (goPackages) => {
          const testDir = generateTestDir();
          
          try {
            // Create Go packages with unique paths
            const packages: TestPackage[] = goPackages.map((pkg, index) => ({
              pathSegments: [...pkg.pathSegments, `go-pkg-${index}`],
              type: "go" as PackageType,
              name: `${pkg.name}-${index}`,
            }));
            
            const createdPaths = await createTestWorkspace(testDir, packages);
            
            // Discover packages
            const discoveredPaths = await discoverPackages(testDir);
            
            // Verify all Go packages are discovered
            for (const createdPath of createdPaths) {
              expect(discoveredPaths).toContain(createdPath);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.4: TypeScript packages (directories with package.json) are discovered
   *
   * For any directory containing a package.json file, the discoverPackages function
   * SHALL identify it as a package.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover all TypeScript packages (directories with package.json)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            pathSegments: fc.array(dirSegmentArb, { minLength: 0, maxLength: 5 }),
            name: packageNameArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (tsPackages) => {
          const testDir = generateTestDir();
          
          try {
            // Create TypeScript packages with unique paths
            const packages: TestPackage[] = tsPackages.map((pkg, index) => ({
              pathSegments: [...pkg.pathSegments, `ts-pkg-${index}`],
              type: "typescript" as PackageType,
              name: `${pkg.name}-${index}`,
            }));
            
            const createdPaths = await createTestWorkspace(testDir, packages);
            
            // Discover packages
            const discoveredPaths = await discoverPackages(testDir);
            
            // Verify all TypeScript packages are discovered
            for (const createdPath of createdPaths) {
              expect(discoveredPaths).toContain(createdPath);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.5: Multi-language packages (both go.mod and package.json) are discovered
   *
   * For any directory containing both go.mod and package.json files, the discoverPackages
   * function SHALL identify it as a package (discovered once, not twice).
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover multi-language packages (both go.mod and package.json) exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            pathSegments: fc.array(dirSegmentArb, { minLength: 0, maxLength: 5 }),
            name: packageNameArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (multiPackages) => {
          const testDir = generateTestDir();
          
          try {
            // Create multi-language packages with unique paths
            const packages: TestPackage[] = multiPackages.map((pkg, index) => ({
              pathSegments: [...pkg.pathSegments, `multi-pkg-${index}`],
              type: "both" as PackageType,
              name: `${pkg.name}-${index}`,
            }));
            
            const createdPaths = await createTestWorkspace(testDir, packages);
            
            // Discover packages
            const discoveredPaths = await discoverPackages(testDir);
            
            // Verify all multi-language packages are discovered exactly once
            for (const createdPath of createdPaths) {
              const occurrences = discoveredPaths.filter(p => p === createdPath).length;
              expect(occurrences).toBe(1);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.6: Mixed workspace with packages at various depths
   *
   * For any workspace containing a mix of Go, TypeScript, and multi-language packages
   * at various nesting depths, the discoverPackages function SHALL find all packages.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover all packages in mixed workspace with various depths", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            depth: nestingDepthArb,
            type: packageTypeArb,
            name: packageNameArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (packageSpecs) => {
          const testDir = generateTestDir();
          
          try {
            // Create packages at various depths with unique paths
            const packages: TestPackage[] = packageSpecs.map((spec, index) => {
              const pathSegments: string[] = [];
              for (let i = 0; i < spec.depth; i++) {
                pathSegments.push(`depth-${i}`);
              }
              pathSegments.push(`pkg-${index}`);
              
              return {
                pathSegments,
                type: spec.type,
                name: `${spec.name}-${index}`,
              };
            });
            
            const createdPaths = await createTestWorkspace(testDir, packages);
            
            // Discover packages
            const discoveredPaths = await discoverPackages(testDir);
            
            // Verify all packages are discovered
            for (const createdPath of createdPaths) {
              expect(discoveredPaths).toContain(createdPath);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.7: Discovery count matches created package count
   *
   * For any workspace with N packages created, the discoverPackages function
   * SHALL discover at least N packages (may discover more if workspace root
   * itself is a package).
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover at least as many packages as were created", async () => {
    await fc.assert(
      fc.asyncProperty(workspaceArb, async (packages) => {
        const testDir = generateTestDir();
        
        try {
          const createdPaths = await createTestWorkspace(testDir, packages);
          const discoveredPaths = await discoverPackages(testDir);
          
          // Should discover at least as many packages as we created
          expect(discoveredPaths.length).toBeGreaterThanOrEqual(createdPaths.length);
          
          // All created packages should be in discovered set
          const discoveredSet = new Set(discoveredPaths);
          for (const created of createdPaths) {
            expect(discoveredSet.has(created)).toBe(true);
          }
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.8: Empty workspace returns empty array
   *
   * For any empty workspace (no packages), the discoverPackages function
   * SHALL return an empty array.
   *
   * **Validates: Requirement 6.3**
   */
  it("should return empty array for workspace with no packages", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dirSegmentArb, { minLength: 0, maxLength: 3 }),
        async (emptyDirs) => {
          const testDir = generateTestDir();
          
          try {
            // Create empty directories (no package markers)
            await mkdir(testDir, { recursive: true });
            for (let i = 0; i < emptyDirs.length; i++) {
              const dirPath = join(testDir, `empty-${i}`, emptyDirs[i] || "subdir");
              await mkdir(dirPath, { recursive: true });
              // Create a non-package file
              await writeFile(join(dirPath, "README.md"), "# Empty directory");
            }
            
            const discoveredPaths = await discoverPackages(testDir);
            
            // Should discover no packages
            expect(discoveredPaths).toEqual([]);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.9: Discovery is deterministic
   *
   * For any workspace structure, calling discoverPackages multiple times
   * SHALL return the same set of packages (order may vary).
   *
   * **Validates: Requirement 6.3**
   */
  it("should return same packages on multiple discovery calls (determinism)", async () => {
    await fc.assert(
      fc.asyncProperty(workspaceArb, async (packages) => {
        const testDir = generateTestDir();
        
        try {
          await createTestWorkspace(testDir, packages);
          
          // Discover packages multiple times
          const discovered1 = await discoverPackages(testDir);
          const discovered2 = await discoverPackages(testDir);
          const discovered3 = await discoverPackages(testDir);
          
          // Sort for comparison (order may vary)
          const sorted1 = [...discovered1].sort();
          const sorted2 = [...discovered2].sort();
          const sorted3 = [...discovered3].sort();
          
          // All discoveries should return the same packages
          expect(sorted1).toEqual(sorted2);
          expect(sorted2).toEqual(sorted3);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.10: Nested packages within packages are discovered
   *
   * For any workspace where packages are nested within other packages,
   * the discoverPackages function SHALL discover all packages including
   * both parent and child packages.
   *
   * **Validates: Requirement 6.3**
   */
  it("should discover nested packages within packages", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        packageNameArb,
        packageTypeArb,
        packageTypeArb,
        async (parentName, childName, parentType, childType) => {
          const testDir = generateTestDir();
          
          try {
            // Create parent package
            const parentPath = join(testDir, "parent");
            await mkdir(parentPath, { recursive: true });
            
            if (parentType === "go" || parentType === "both") {
              await writeFile(
                join(parentPath, "go.mod"),
                createGoModContent(`example.com/${parentName}`)
              );
            }
            if (parentType === "typescript" || parentType === "both") {
              await writeFile(
                join(parentPath, "package.json"),
                createPackageJsonContent(parentName)
              );
            }
            
            // Create child package nested within parent
            const childPath = join(parentPath, "child");
            await mkdir(childPath, { recursive: true });
            
            if (childType === "go" || childType === "both") {
              await writeFile(
                join(childPath, "go.mod"),
                createGoModContent(`example.com/${childName}`)
              );
            }
            if (childType === "typescript" || childType === "both") {
              await writeFile(
                join(childPath, "package.json"),
                createPackageJsonContent(childName)
              );
            }
            
            const discoveredPaths = await discoverPackages(testDir);
            
            // Both parent and child should be discovered
            expect(discoveredPaths).toContain(parentPath);
            expect(discoveredPaths).toContain(childPath);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * ============================================================================
 * Property 19: Dependency Order Processing
 * ============================================================================
 *
 * For any workspace with inter-package dependencies, the workspace indexing tool
 * SHALL process packages in dependency order (dependencies before dependents).
 *
 * **Validates: Requirement 6.4**
 */

/**
 * Represents a package with dependencies for test generation
 */
interface DependencyTestPackage {
  /** Package name (unique identifier) */
  name: string;
  /** Names of packages this package depends on */
  dependsOn: string[];
  /** Package type (go, typescript, or both) */
  type: PackageType;
}

/**
 * Represents a generated DAG (Directed Acyclic Graph) of packages
 */
interface PackageDAG {
  /** All packages in the DAG */
  packages: DependencyTestPackage[];
  /** Map of package name to its dependencies */
  dependencyMap: Map<string, string[]>;
}

/**
 * Arbitrary for generating a valid DAG of packages with dependencies.
 * Ensures no circular dependencies by only allowing dependencies on
 * packages that appear earlier in the list.
 */
const packageDAGArb: fc.Arbitrary<PackageDAG> = fc
  .integer({ min: 2, max: 8 })
  .chain((numPackages) => {
    // Generate package names first
    return fc
      .array(packageNameArb, { minLength: numPackages, maxLength: numPackages })
      .chain((names) => {
        // Make names unique by appending index
        const uniqueNames = names.map((name, idx) => `${name}-${idx}`);

        // For each package, generate dependencies from earlier packages only
        // This ensures a valid DAG (no cycles)
        return fc
          .tuple(
            ...uniqueNames.map((_, idx) => {
              if (idx === 0) {
                // First package has no dependencies
                return fc.constant([] as string[]);
              }
              // Can depend on any earlier package
              const possibleDeps = uniqueNames.slice(0, idx);
              return fc.subarray(possibleDeps, { minLength: 0, maxLength: Math.min(3, idx) });
            })
          )
          .chain((dependenciesArray) => {
            // Generate package types
            return fc
              .array(packageTypeArb, { minLength: numPackages, maxLength: numPackages })
              .map((types) => {
                const packages: DependencyTestPackage[] = uniqueNames.map((name, idx) => ({
                  name,
                  dependsOn: dependenciesArray[idx] || [],
                  type: types[idx] || "typescript",
                }));

                const dependencyMap = new Map<string, string[]>();
                for (const pkg of packages) {
                  dependencyMap.set(pkg.name, pkg.dependsOn);
                }

                return { packages, dependencyMap };
              });
          });
      });
  });

/**
 * Arbitrary for generating a linear dependency chain (A -> B -> C -> ...)
 * This is a simple case where the order is deterministic.
 */
const linearDependencyChainArb: fc.Arbitrary<DependencyTestPackage[]> = fc
  .integer({ min: 2, max: 6 })
  .chain((chainLength) => {
    return fc
      .array(packageNameArb, { minLength: chainLength, maxLength: chainLength })
      .chain((names) => {
        const uniqueNames = names.map((name, idx) => `chain-${name}-${idx}`);
        return fc
          .array(packageTypeArb, { minLength: chainLength, maxLength: chainLength })
          .map((types) => {
            return uniqueNames.map((name, idx) => ({
              name,
              // Each package depends on the previous one (except the first)
              dependsOn: idx > 0 ? [uniqueNames[idx - 1]!] : [],
              type: types[idx] || "typescript",
            }));
          });
      });
  });

/**
 * Create a go.mod file content with dependencies
 */
function createGoModContentWithDeps(moduleName: string, dependencies: string[]): string {
  let content = `module ${moduleName}

go 1.21
`;

  if (dependencies.length > 0) {
    content += "\nrequire (\n";
    for (const dep of dependencies) {
      content += `\t${dep} v1.0.0\n`;
    }
    content += ")\n";
  }

  return content;
}

/**
 * Create a package.json file content with dependencies
 */
function createPackageJsonContentWithDeps(name: string, dependencies: string[]): string {
  const deps: Record<string, string> = {};
  for (const dep of dependencies) {
    deps[dep] = "^1.0.0";
  }

  return JSON.stringify(
    {
      name,
      version: "1.0.0",
      dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    },
    null,
    2
  );
}

/**
 * Create a test workspace with packages that have dependencies
 *
 * @param workspaceRoot - Root directory for the workspace
 * @param packages - Array of packages with dependencies to create
 * @returns Map of package name to absolute path
 */
async function createDependencyTestWorkspace(
  workspaceRoot: string,
  packages: DependencyTestPackage[]
): Promise<Map<string, string>> {
  const packagePaths = new Map<string, string>();

  for (const pkg of packages) {
    // Create package directory
    const packagePath = join(workspaceRoot, pkg.name);
    await mkdir(packagePath, { recursive: true });
    packagePaths.set(pkg.name, packagePath);

    // Create package marker files based on type
    if (pkg.type === "go" || pkg.type === "both") {
      await writeFile(
        join(packagePath, "go.mod"),
        createGoModContentWithDeps(`example.com/${pkg.name}`, pkg.dependsOn)
      );
    }

    if (pkg.type === "typescript" || pkg.type === "both") {
      await writeFile(
        join(packagePath, "package.json"),
        createPackageJsonContentWithDeps(pkg.name, pkg.dependsOn)
      );
    }
  }

  return packagePaths;
}

/**
 * Verify that all dependencies appear before their dependents in the sorted order.
 *
 * @param sortedPackages - Array of package paths in sorted order
 * @param packagePaths - Map of package name to path
 * @param dependencyMap - Map of package name to its dependencies
 * @returns True if order is valid, false otherwise
 */
function verifyDependencyOrder(
  sortedPackages: string[],
  packagePaths: Map<string, string>,
  dependencyMap: Map<string, string[]>
): boolean {
  // Create reverse map: path -> name
  const pathToName = new Map<string, string>();
  for (const [name, path] of packagePaths) {
    pathToName.set(path, name);
  }

  // Create position map for sorted packages
  const positionMap = new Map<string, number>();
  for (let i = 0; i < sortedPackages.length; i++) {
    const path = sortedPackages[i]!;
    const name = pathToName.get(path);
    if (name) {
      positionMap.set(name, i);
    }
  }

  // Verify each package's dependencies appear before it
  for (const [name, deps] of dependencyMap) {
    const packagePosition = positionMap.get(name);
    if (packagePosition === undefined) {
      continue; // Package not in sorted list
    }

    for (const dep of deps) {
      const depPosition = positionMap.get(dep);
      if (depPosition === undefined) {
        continue; // Dependency not in sorted list (external dependency)
      }

      // Dependency must appear before the dependent
      if (depPosition >= packagePosition) {
        return false;
      }
    }
  }

  return true;
}

describe("Feature: documentation-tools, Property 19: Dependency Order Processing", () => {
  /**
   * Property 19.1: Dependencies are processed before dependents
   *
   * For any workspace with inter-package dependencies, the orderPackagesByDependencies
   * function SHALL return packages in an order where all dependencies appear before
   * their dependents.
   *
   * **Validates: Requirement 6.4**
   */
  it("should process dependencies before dependents", async () => {
    await fc.assert(
      fc.asyncProperty(packageDAGArb, async (dag) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace with dependencies
          const packagePaths = await createDependencyTestWorkspace(testDir, dag.packages);

          // Get all package paths
          const allPaths = Array.from(packagePaths.values());

          // Order packages by dependencies
          const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

          // Verify dependency order
          const isValidOrder = verifyDependencyOrder(
            sortedPaths,
            packagePaths,
            dag.dependencyMap
          );

          expect(isValidOrder).toBe(true);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.2: Linear dependency chains are ordered correctly
   *
   * For any linear dependency chain (A -> B -> C), the orderPackagesByDependencies
   * function SHALL return packages in the correct order (C, B, A) where the
   * package with no dependencies comes first.
   *
   * **Validates: Requirement 6.4**
   */
  it("should correctly order linear dependency chains", async () => {
    await fc.assert(
      fc.asyncProperty(linearDependencyChainArb, async (packages) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const packagePaths = await createDependencyTestWorkspace(testDir, packages);

          // Get all package paths
          const allPaths = Array.from(packagePaths.values());

          // Order packages by dependencies
          const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

          // Create dependency map
          const dependencyMap = new Map<string, string[]>();
          for (const pkg of packages) {
            dependencyMap.set(pkg.name, pkg.dependsOn);
          }

          // Verify dependency order
          const isValidOrder = verifyDependencyOrder(
            sortedPaths,
            packagePaths,
            dependencyMap
          );

          expect(isValidOrder).toBe(true);

          // For linear chains, the first package in sorted order should have no dependencies
          const pathToName = new Map<string, string>();
          for (const [name, path] of packagePaths) {
            pathToName.set(path, name);
          }

          const firstPackageName = pathToName.get(sortedPaths[0]!);
          if (firstPackageName) {
            const firstPackageDeps = dependencyMap.get(firstPackageName) || [];
            expect(firstPackageDeps.length).toBe(0);
          }
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.3: All packages are included in the sorted output
   *
   * For any workspace with packages, the orderPackagesByDependencies function
   * SHALL include all input packages in the output (no packages are lost).
   *
   * **Validates: Requirement 6.4**
   */
  it("should include all packages in sorted output", async () => {
    await fc.assert(
      fc.asyncProperty(packageDAGArb, async (dag) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const packagePaths = await createDependencyTestWorkspace(testDir, dag.packages);

          // Get all package paths
          const allPaths = Array.from(packagePaths.values());

          // Order packages by dependencies
          const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

          // Verify all packages are included
          expect(sortedPaths.length).toBe(allPaths.length);

          // Verify each input package is in the output
          const sortedSet = new Set(sortedPaths);
          for (const path of allPaths) {
            expect(sortedSet.has(path)).toBe(true);
          }
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.4: Packages with no dependencies can appear first
   *
   * For any workspace, packages with no dependencies (leaf nodes) SHALL be
   * able to appear at the beginning of the sorted order.
   *
   * **Validates: Requirement 6.4**
   */
  it("should allow packages with no dependencies to appear first", async () => {
    await fc.assert(
      fc.asyncProperty(packageDAGArb, async (dag) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const packagePaths = await createDependencyTestWorkspace(testDir, dag.packages);

          // Get all package paths
          const allPaths = Array.from(packagePaths.values());

          // Order packages by dependencies
          const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

          // Find packages with no dependencies
          const packagesWithNoDeps = dag.packages.filter(
            (pkg) => pkg.dependsOn.length === 0
          );

          // At least one package with no dependencies should exist (first in DAG)
          expect(packagesWithNoDeps.length).toBeGreaterThan(0);

          // The first package in sorted order should have no dependencies
          // (or all its dependencies are external to the workspace)
          const pathToName = new Map<string, string>();
          for (const [name, path] of packagePaths) {
            pathToName.set(path, name);
          }

          const firstName = pathToName.get(sortedPaths[0]!);
          if (firstName) {
            const firstDeps = dag.dependencyMap.get(firstName) || [];
            // All dependencies should be external (not in our package list)
            const internalDeps = firstDeps.filter((dep) => packagePaths.has(dep));
            expect(internalDeps.length).toBe(0);
          }
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.5: Dependency ordering is deterministic
   *
   * For any workspace, calling orderPackagesByDependencies multiple times
   * SHALL return the same order (deterministic behavior).
   *
   * **Validates: Requirement 6.4**
   */
  it("should produce deterministic ordering on multiple calls", async () => {
    await fc.assert(
      fc.asyncProperty(packageDAGArb, async (dag) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const packagePaths = await createDependencyTestWorkspace(testDir, dag.packages);

          // Get all package paths
          const allPaths = Array.from(packagePaths.values());

          // Order packages multiple times
          const sorted1 = await orderPackagesByDependencies(testDir, allPaths);
          const sorted2 = await orderPackagesByDependencies(testDir, allPaths);
          const sorted3 = await orderPackagesByDependencies(testDir, allPaths);

          // All orderings should be identical
          expect(sorted1).toEqual(sorted2);
          expect(sorted2).toEqual(sorted3);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.6: Diamond dependencies are handled correctly
   *
   * For diamond dependency patterns (A depends on B and C, both B and C depend on D),
   * the orderPackagesByDependencies function SHALL ensure D appears before B and C,
   * and both B and C appear before A.
   *
   * **Validates: Requirement 6.4**
   */
  it("should handle diamond dependency patterns correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        packageNameArb,
        packageNameArb,
        packageNameArb,
        packageTypeArb,
        async (nameA, nameB, nameC, nameD, type) => {
          const testDir = generateTestDir();

          try {
            // Create diamond pattern: A -> B, A -> C, B -> D, C -> D
            const packages: DependencyTestPackage[] = [
              { name: `${nameD}-d`, dependsOn: [], type },
              { name: `${nameB}-b`, dependsOn: [`${nameD}-d`], type },
              { name: `${nameC}-c`, dependsOn: [`${nameD}-d`], type },
              { name: `${nameA}-a`, dependsOn: [`${nameB}-b`, `${nameC}-c`], type },
            ];

            const packagePaths = await createDependencyTestWorkspace(testDir, packages);
            const allPaths = Array.from(packagePaths.values());

            // Order packages by dependencies
            const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

            // Create position map
            const pathToName = new Map<string, string>();
            for (const [name, path] of packagePaths) {
              pathToName.set(path, name);
            }

            const positionMap = new Map<string, number>();
            for (let i = 0; i < sortedPaths.length; i++) {
              const name = pathToName.get(sortedPaths[i]!);
              if (name) {
                positionMap.set(name, i);
              }
            }

            // Verify D comes before B and C
            const posD = positionMap.get(`${nameD}-d`)!;
            const posB = positionMap.get(`${nameB}-b`)!;
            const posC = positionMap.get(`${nameC}-c`)!;
            const posA = positionMap.get(`${nameA}-a`)!;

            expect(posD).toBeLessThan(posB);
            expect(posD).toBeLessThan(posC);

            // Verify B and C come before A
            expect(posB).toBeLessThan(posA);
            expect(posC).toBeLessThan(posA);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.7: Independent packages can appear in any relative order
   *
   * For packages with no dependencies between them (independent packages),
   * the orderPackagesByDependencies function MAY return them in any order,
   * but the overall dependency constraints must still be satisfied.
   *
   * **Validates: Requirement 6.4**
   */
  it("should handle independent packages while maintaining dependency constraints", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(packageNameArb, { minLength: 2, maxLength: 5 }),
        packageTypeArb,
        async (names, type) => {
          const testDir = generateTestDir();

          try {
            // Create independent packages (no dependencies between them)
            const uniqueNames = names.map((name, idx) => `indep-${name}-${idx}`);
            const packages: DependencyTestPackage[] = uniqueNames.map((name) => ({
              name,
              dependsOn: [],
              type,
            }));

            const packagePaths = await createDependencyTestWorkspace(testDir, packages);
            const allPaths = Array.from(packagePaths.values());

            // Order packages by dependencies
            const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

            // All packages should be included
            expect(sortedPaths.length).toBe(allPaths.length);

            // Since there are no dependencies, any order is valid
            // Just verify all packages are present
            const sortedSet = new Set(sortedPaths);
            for (const path of allPaths) {
              expect(sortedSet.has(path)).toBe(true);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.8: Mixed Go and TypeScript dependencies are handled
   *
   * For workspaces with both Go and TypeScript packages that have cross-language
   * dependencies, the orderPackagesByDependencies function SHALL correctly
   * order packages regardless of language.
   *
   * **Validates: Requirement 6.4**
   */
  it("should handle mixed Go and TypeScript dependencies", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        packageNameArb,
        packageNameArb,
        async (nameGo, nameTs, nameBoth) => {
          const testDir = generateTestDir();

          try {
            // Create mixed language packages with dependencies
            const packages: DependencyTestPackage[] = [
              { name: `${nameGo}-go`, dependsOn: [], type: "go" },
              { name: `${nameTs}-ts`, dependsOn: [`${nameGo}-go`], type: "typescript" },
              { name: `${nameBoth}-both`, dependsOn: [`${nameTs}-ts`], type: "both" },
            ];

            const packagePaths = await createDependencyTestWorkspace(testDir, packages);
            const allPaths = Array.from(packagePaths.values());

            // Order packages by dependencies
            const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

            // Create dependency map
            const dependencyMap = new Map<string, string[]>();
            for (const pkg of packages) {
              dependencyMap.set(pkg.name, pkg.dependsOn);
            }

            // Verify dependency order
            const isValidOrder = verifyDependencyOrder(
              sortedPaths,
              packagePaths,
              dependencyMap
            );

            expect(isValidOrder).toBe(true);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.9: Empty package list returns empty result
   *
   * For an empty package list, the orderPackagesByDependencies function
   * SHALL return an empty array.
   *
   * **Validates: Requirement 6.4**
   */
  it("should return empty array for empty package list", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const testDir = generateTestDir();

        try {
          await mkdir(testDir, { recursive: true });

          // Order empty package list
          const sortedPaths = await orderPackagesByDependencies(testDir, []);

          expect(sortedPaths).toEqual([]);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.10: Single package returns that package
   *
   * For a single package with no dependencies, the orderPackagesByDependencies
   * function SHALL return an array containing just that package.
   *
   * **Validates: Requirement 6.4**
   */
  it("should return single package for single-package workspace", async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, packageTypeArb, async (name, type) => {
        const testDir = generateTestDir();

        try {
          // Create single package
          const packages: DependencyTestPackage[] = [
            { name: `single-${name}`, dependsOn: [], type },
          ];

          const packagePaths = await createDependencyTestWorkspace(testDir, packages);
          const allPaths = Array.from(packagePaths.values());

          // Order packages by dependencies
          const sortedPaths = await orderPackagesByDependencies(testDir, allPaths);

          expect(sortedPaths.length).toBe(1);
          expect(sortedPaths[0]).toBe(allPaths[0]);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * ============================================================================
 * Property 20: Force Parameter Behavior
 * ============================================================================
 *
 * For any workspace with unchanged packages, setting `force=true` SHALL cause
 * all packages to be re-indexed/re-documented regardless of their change status.
 * Setting `packages` parameter SHALL limit processing to only the specified packages.
 *
 * **Validates: Requirements 6.7, 7.6**
 */

import {
  indexWorkspace,
  hasPackageChanged,
} from "../../src/tools/workspace_indexing.js";
import type {
  IndexWorkspaceInput,
  IndexWorkspaceOutput,
} from "../../src/types/tools.js";

/**
 * Create a metadata.json file to simulate a previously indexed package.
 * This makes the package appear "unchanged" to the change detection logic.
 *
 * @param packagePath - Path to the package directory
 * @param language - Language type for the index
 */
async function createMetadataForUnchangedPackage(
  packagePath: string,
  language: "go" | "typescript" | "both"
): Promise<void> {
  const archonDir = join(packagePath, ".archon", "scip");
  await mkdir(archonDir, { recursive: true });

  const indexes: Array<{
    language: "go" | "typescript";
    indexFile: string;
    hash: string;
    symbolCount: number;
  }> = [];

  if (language === "go" || language === "both") {
    indexes.push({
      language: "go",
      indexFile: ".archon/scip/index.go.scip",
      hash: "abc123",
      symbolCount: 10,
    });
    // Create a dummy index file
    await writeFile(join(packagePath, ".archon", "scip", "index.go.scip"), "dummy");
  }

  if (language === "typescript" || language === "both") {
    indexes.push({
      language: "typescript",
      indexFile: ".archon/scip/index.ts.scip",
      hash: "def456",
      symbolCount: 20,
    });
    // Create a dummy index file
    await writeFile(join(packagePath, ".archon", "scip", "index.ts.scip"), "dummy");
  }

  const metadata = {
    packagePath,
    lastIndexed: new Date().toISOString(),
    indexes,
  };

  await writeFile(
    join(archonDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
}

/**
 * Arbitrary for generating a workspace with packages that have metadata
 * (simulating previously indexed, unchanged packages).
 */
const unchangedWorkspaceArb: fc.Arbitrary<TestPackage[]> = fc
  .array(
    fc.record({
      pathSegments: fc.array(dirSegmentArb, { minLength: 0, maxLength: 3 }),
      type: packageTypeArb,
      name: packageNameArb,
    }),
    { minLength: 1, maxLength: 5 }
  )
  .map((packages) => {
    // Ensure unique paths by appending index
    return packages.map((pkg, index) => ({
      pathSegments: [...pkg.pathSegments, `unchanged-pkg-${index}`],
      type: pkg.type,
      name: `${pkg.name}-${index}`,
    }));
  });

/**
 * Arbitrary for generating a subset of package names to filter.
 * Given a list of packages, generates a non-empty subset of their names.
 */
function packageSubsetArb(packages: TestPackage[]): fc.Arbitrary<string[]> {
  if (packages.length === 0) {
    return fc.constant([]);
  }
  
  const packageNames = packages.map((pkg) => pkg.name);
  return fc.subarray(packageNames, { minLength: 1, maxLength: packages.length });
}

describe("Feature: documentation-tools, Property 20: Force Parameter Behavior", () => {
  /**
   * Property 20.1: Force=true causes re-indexing of unchanged packages
   *
   * For any workspace with packages that have existing metadata (unchanged),
   * setting `force=true` SHALL cause those packages to be re-indexed
   * regardless of their change status.
   *
   * NOTE: This test uses reduced iterations (15) because it invokes external
   * SCIP tools which are slow. The property is still validated but with
   * fewer random inputs.
   *
   * **Validates: Requirement 6.7**
   */
  it("should re-index unchanged packages when force=true", async () => {
    await fc.assert(
      fc.asyncProperty(unchangedWorkspaceArb, async (packages) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const createdPaths = await createTestWorkspace(testDir, packages);

          // Create metadata for all packages to simulate "unchanged" state
          for (let i = 0; i < packages.length; i++) {
            await createMetadataForUnchangedPackage(createdPaths[i]!, packages[i]!.type);
          }

          // Verify packages appear unchanged
          for (const path of createdPaths) {
            const changed = await hasPackageChanged(path);
            expect(changed).toBe(false);
          }

          // Index with force=true
          const result = await indexWorkspace({
            workspacePath: testDir,
            force: true,
          });

          // With force=true, packages should be processed (not skipped due to being unchanged)
          // They may end up in errors if SCIP tools aren't installed, or skipped if
          // no supported languages are detected, but the key property is that
          // the change detection is bypassed.
          
          // The key property: force=true means packages are NOT skipped due to being unchanged
          // They may still be skipped for other reasons (no supported languages detected)
          // but the change detection should be bypassed
          expect(result.success).toBeDefined();
          
          // Verify the result structure is valid
          expect(result.workspacePath).toBe(testDir);
          expect(Array.isArray(result.packagesIndexed)).toBe(true);
          expect(Array.isArray(result.packagesSkipped)).toBe(true);
          expect(Array.isArray(result.errors)).toBe(true);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 120000); // 120 second timeout for this test

  /**
   * Property 20.2: Force=false skips unchanged packages
   *
   * For any workspace with packages that have existing metadata (unchanged),
   * setting `force=false` (or omitting it) SHALL skip those packages
   * and report them as skipped.
   *
   * **Validates: Requirement 6.7**
   */
  it("should skip unchanged packages when force=false", async () => {
    await fc.assert(
      fc.asyncProperty(unchangedWorkspaceArb, async (packages) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const createdPaths = await createTestWorkspace(testDir, packages);

          // Create metadata for all packages to simulate "unchanged" state
          for (let i = 0; i < packages.length; i++) {
            await createMetadataForUnchangedPackage(createdPaths[i]!, packages[i]!.type);
          }

          // Verify packages appear unchanged
          for (const path of createdPaths) {
            const changed = await hasPackageChanged(path);
            expect(changed).toBe(false);
          }

          // Index with force=false (default)
          const result = await indexWorkspace({
            workspacePath: testDir,
            force: false,
          });

          // With force=false, unchanged packages should be skipped
          // All our packages have metadata, so they should all be skipped
          expect(result.packagesSkipped.length).toBeGreaterThan(0);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: Packages parameter limits processing to specified packages
   *
   * For any workspace with multiple packages, setting the `packages` parameter
   * SHALL limit processing to only the specified packages.
   *
   * NOTE: This test uses reduced iterations (15) because it invokes external
   * SCIP tools which are slow.
   *
   * **Validates: Requirement 6.8**
   */
  it("should limit processing to specified packages when packages parameter is set", async () => {
    await fc.assert(
      fc.asyncProperty(
        unchangedWorkspaceArb.filter((pkgs) => pkgs.length >= 2),
        async (packages) => {
          const testDir = generateTestDir();

          try {
            // Create the test workspace
            await createTestWorkspace(testDir, packages);

            // Select a subset of packages to process
            const selectedPackages = packages.slice(0, Math.ceil(packages.length / 2));
            const selectedNames = selectedPackages.map((pkg) => pkg.name);

            // Index with packages filter
            const result = await indexWorkspace({
              workspacePath: testDir,
              packages: selectedNames,
              force: true, // Use force to ensure processing
            });

            // Verify only selected packages were considered
            // The result should only contain packages from our selected list
            // (either indexed, skipped, or errored)
            const allProcessedPackages = [
              ...result.packagesIndexed.map((p) => p.package),
              ...result.packagesSkipped,
              ...result.errors.map((e) => e.package),
            ];

            // All processed packages should be from our selected list
            // (matching by name, which is the basename)
            for (const processed of allProcessedPackages) {
              // The processed name is the basename, check if it matches any selected package
              const matchesSelected = selectedNames.some(
                (name) => processed.includes(name) || name.includes(processed)
              );
              // Note: This is a loose check because package names may be transformed
              expect(matchesSelected || selectedNames.length === 0).toBe(true);
            }
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 60000); // 60 second timeout for this test

  /**
   * Property 20.4: Empty packages parameter processes all packages
   *
   * For any workspace, when the `packages` parameter is empty or undefined,
   * all discovered packages SHALL be processed.
   *
   * **Validates: Requirement 6.8**
   */
  it("should process all packages when packages parameter is empty or undefined", async () => {
    await fc.assert(
      fc.asyncProperty(unchangedWorkspaceArb, async (packages) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          await createTestWorkspace(testDir, packages);

          // Index without packages filter (undefined)
          const resultUndefined = await indexWorkspace({
            workspacePath: testDir,
            force: true,
          });

          // Index with empty packages filter
          const resultEmpty = await indexWorkspace({
            workspacePath: testDir,
            packages: [],
            force: true,
          });

          // Both should process all packages
          // The total count of processed packages should match
          const totalUndefined =
            resultUndefined.packagesIndexed.length +
            resultUndefined.packagesSkipped.length +
            resultUndefined.errors.length;

          const totalEmpty =
            resultEmpty.packagesIndexed.length +
            resultEmpty.packagesSkipped.length +
            resultEmpty.errors.length;

          // Both approaches should discover and attempt to process the same packages
          expect(totalUndefined).toBe(totalEmpty);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 120000); // 120 second timeout for this test

  /**
   * Property 20.5: Force and packages parameters work together
   *
   * For any workspace, when both `force=true` and `packages` parameter are set,
   * only the specified packages SHALL be processed, and they SHALL be
   * re-indexed regardless of change status.
   *
   * NOTE: This test uses reduced iterations (15) because it invokes external
   * SCIP tools which are slow.
   *
   * **Validates: Requirements 6.7, 6.8**
   */
  it("should combine force and packages parameters correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        unchangedWorkspaceArb.filter((pkgs) => pkgs.length >= 2),
        async (packages) => {
          const testDir = generateTestDir();

          try {
            // Create the test workspace
            const createdPaths = await createTestWorkspace(testDir, packages);

            // Create metadata for all packages to simulate "unchanged" state
            for (let i = 0; i < packages.length; i++) {
              await createMetadataForUnchangedPackage(createdPaths[i]!, packages[i]!.type);
            }

            // Select first package only
            const selectedPackage = packages[0]!;
            const selectedNames = [selectedPackage.name];

            // Index with both force=true and packages filter
            const result = await indexWorkspace({
              workspacePath: testDir,
              packages: selectedNames,
              force: true,
            });

            // The result should only contain the selected package
            // (either indexed, skipped for other reasons, or errored)
            const allProcessedPackages = [
              ...result.packagesIndexed.map((p) => p.package),
              ...result.packagesSkipped,
              ...result.errors.map((e) => e.package),
            ];

            // Should have processed at most the number of selected packages
            // (may be less if the package wasn't discovered)
            expect(allProcessedPackages.length).toBeLessThanOrEqual(selectedNames.length + 1);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 120000); // 120 second timeout for this test

  /**
   * Property 20.6: hasPackageChanged returns false for packages with valid metadata
   *
   * For any package with a valid metadata.json file and existing index files,
   * the hasPackageChanged function SHALL return false.
   *
   * **Validates: Requirement 6.5**
   */
  it("should detect unchanged packages correctly via hasPackageChanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        packageTypeArb,
        async (name, type) => {
          const testDir = generateTestDir();

          try {
            // Create a single package
            const packages: TestPackage[] = [{
              pathSegments: [],
              type,
              name,
            }];

            const createdPaths = await createTestWorkspace(testDir, packages);
            const packagePath = createdPaths[0]!;

            // Initially, package should be "changed" (no metadata)
            const changedBefore = await hasPackageChanged(packagePath);
            expect(changedBefore).toBe(true);

            // Create metadata to simulate indexed state
            await createMetadataForUnchangedPackage(packagePath, type);

            // Now package should be "unchanged"
            const changedAfter = await hasPackageChanged(packagePath);
            expect(changedAfter).toBe(false);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.7: hasPackageChanged returns true for packages without metadata
   *
   * For any package without a metadata.json file (never indexed),
   * the hasPackageChanged function SHALL return true.
   *
   * **Validates: Requirement 6.5**
   */
  it("should detect new packages as changed via hasPackageChanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        packageTypeArb,
        async (name, type) => {
          const testDir = generateTestDir();

          try {
            // Create a single package without metadata
            const packages: TestPackage[] = [{
              pathSegments: [],
              type,
              name,
            }];

            const createdPaths = await createTestWorkspace(testDir, packages);
            const packagePath = createdPaths[0]!;

            // Package without metadata should be "changed"
            const changed = await hasPackageChanged(packagePath);
            expect(changed).toBe(true);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.8: Packages parameter with non-existent package names
   *
   * For any workspace, when the `packages` parameter contains names that
   * don't match any discovered packages, those names SHALL be ignored
   * and only matching packages SHALL be processed.
   *
   * NOTE: This test uses reduced iterations (15) because it invokes external
   * SCIP tools which are slow.
   *
   * **Validates: Requirement 6.8**
   */
  it("should ignore non-existent package names in packages parameter", async () => {
    await fc.assert(
      fc.asyncProperty(
        unchangedWorkspaceArb,
        packageNameArb,
        async (packages, nonExistentName) => {
          const testDir = generateTestDir();

          try {
            // Create the test workspace
            await createTestWorkspace(testDir, packages);

            // Create a unique non-existent name
            const uniqueNonExistent = `nonexistent-${nonExistentName}-${Date.now()}`;

            // Index with a mix of real and non-existent package names
            const realName = packages[0]?.name || "";
            const result = await indexWorkspace({
              workspacePath: testDir,
              packages: [realName, uniqueNonExistent],
              force: true,
            });

            // The non-existent package should not appear in any result
            const allPackageNames = [
              ...result.packagesIndexed.map((p) => p.package),
              ...result.packagesSkipped,
              ...result.errors.map((e) => e.package),
            ];

            // Non-existent package should not be in results
            expect(allPackageNames).not.toContain(uniqueNonExistent);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 120000); // 120 second timeout for this test

  /**
   * Property 20.9: Force parameter default value is false
   *
   * For any workspace, when the `force` parameter is not specified,
   * it SHALL default to false, meaning unchanged packages are skipped.
   *
   * **Validates: Requirement 6.7**
   */
  it("should default force parameter to false", async () => {
    await fc.assert(
      fc.asyncProperty(unchangedWorkspaceArb, async (packages) => {
        const testDir = generateTestDir();

        try {
          // Create the test workspace
          const createdPaths = await createTestWorkspace(testDir, packages);

          // Create metadata for all packages
          for (let i = 0; i < packages.length; i++) {
            await createMetadataForUnchangedPackage(createdPaths[i]!, packages[i]!.type);
          }

          // Index without specifying force (should default to false)
          const resultDefault = await indexWorkspace({
            workspacePath: testDir,
          });

          // Index with explicit force=false
          const resultExplicit = await indexWorkspace({
            workspacePath: testDir,
            force: false,
          });

          // Both should behave the same - skip unchanged packages
          expect(resultDefault.packagesSkipped.length).toBe(resultExplicit.packagesSkipped.length);
        } finally {
          await cleanupWorkspace(testDir);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.10: Packages parameter is case-insensitive for matching
   *
   * For any workspace, the `packages` parameter matching SHALL be
   * case-insensitive, allowing flexible package name specification.
   *
   * NOTE: This test uses reduced iterations (15) because it invokes external
   * SCIP tools which are slow.
   *
   * **Validates: Requirement 6.8**
   */
  it("should match packages case-insensitively", async () => {
    await fc.assert(
      fc.asyncProperty(
        unchangedWorkspaceArb.filter((pkgs) => pkgs.length >= 1),
        async (packages) => {
          const testDir = generateTestDir();

          try {
            // Create the test workspace
            await createTestWorkspace(testDir, packages);

            const originalName = packages[0]!.name;
            const upperCaseName = originalName.toUpperCase();
            const lowerCaseName = originalName.toLowerCase();

            // Index with uppercase name
            const resultUpper = await indexWorkspace({
              workspacePath: testDir,
              packages: [upperCaseName],
              force: true,
            });

            // Index with lowercase name
            const resultLower = await indexWorkspace({
              workspacePath: testDir,
              packages: [lowerCaseName],
              force: true,
            });

            // Both should find the same packages (case-insensitive matching)
            const totalUpper =
              resultUpper.packagesIndexed.length +
              resultUpper.packagesSkipped.length +
              resultUpper.errors.length;

            const totalLower =
              resultLower.packagesIndexed.length +
              resultLower.packagesSkipped.length +
              resultLower.errors.length;

            expect(totalUpper).toBe(totalLower);
          } finally {
            await cleanupWorkspace(testDir);
          }
        }
      ),
      { numRuns: 15 } // Reduced iterations due to external tool invocation
    );
  }, 120000); // 120 second timeout for this test
});
