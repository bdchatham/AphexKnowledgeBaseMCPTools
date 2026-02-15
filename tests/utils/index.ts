/**
 * Test Utilities Index
 *
 * Re-exports all test utilities for easy importing across test files.
 *
 * @example
 * ```typescript
 * import {
 *   // Generators
 *   arnTypeArb,
 *   symbolKindArb,
 *   filePathArb,
 *   // Helpers
 *   createTestDir,
 *   cleanupTestDir,
 *   createTestPackage,
 *   // Constants
 *   VALID_ARN_TYPES,
 *   DEFAULT_PBT_ITERATIONS,
 * } from "../utils/index.js";
 * ```
 */

// ============================================================================
// Generator Exports
// ============================================================================

export {
  // ARN Component Generators
  VALID_ARN_TYPES,
  arnTypeArb,
  workspaceArb,
  packageNameArb,
  pathSegmentArb,
  filePathArb,
  symbolNameArb,
  safeSymbolNameArb,
  optionalSymbolArb,
  arnComponentsArb,
  normalizedArnComponentsArb,
  arnStringArb,

  // SCIP Symbol Generators
  VALID_SYMBOL_KINDS,
  symbolKindArb,
  VALID_RELATIONSHIP_TYPES,
  relationshipTypeArb,
  lineNumberArb,
  columnNumberArb,
  symbolLocationArb,
  documentationArb,
  signatureArb,
  createScipSymbol,
  scipSymbolArb,
  scipRelationshipArb,
  relationshipsArb,

  // File System Generators
  FILE_EXTENSIONS,
  directoryNameArb,
  fileNameArb,
  extensionArb,
  directoryPathArb,
  sourceFilePathArb,

  // Package Structure Generators
  packageTypeArb,
  goModuleNameArb,
  npmPackageNameArb,
  variableNameArb,
  nestingDepthArb,
  fileCountArb,

  // SCIP Index Generators
  ScipKind,
  VALID_SCIP_KINDS,
  SCIP_KIND_TO_SYMBOL_KIND,
  scipKindArb,
  scipSymbolStringArb,
  occurrenceRangeArb,

  // Documentation Generators
  goFileNameArb,
  tsFileNameArb,
  unrelatedFileNameArb,
  goModContentArb,
  packageJsonContentArb,
  goSourceContentArb,
  tsSourceContentArb,
  generateGoSource,
  generateTypeScriptSource,
} from "./generators.js";

export type { PackageType } from "./generators.js";

// ============================================================================
// Helper Exports
// ============================================================================

export {
  // Temporary Directory Management
  createTestDir,
  cleanupTestDir,
  createTestDirWithCleanup,

  // File System Helpers
  createFile,
  createFiles,
  fileExists,
  readFileOrUndefined,

  // Package Structure Helpers
  createGoModContent,
  createGoModContentWithDeps,
  createPackageJsonContent,
  createPackageJsonContentWithDeps,
  createGoSourceFile,
  createTypeScriptSourceFile,
  createTestPackage,
  createTestWorkspace,

  // Documentation Helpers
  getExpectedDocPath,
  getDirectory,
  getFileNameWithoutExtension,
  createDocWithManualSection,

  // Assertion Helpers
  verifyDependencyOrder,

  // SCIP Index Helpers
  MINIMAL_SCIP_PROTO,
  SymbolRole,

  // Test Timeout Constants
  TOOL_INVOCATION_TIMEOUT,
  EXTENDED_TOOL_TIMEOUT,
  DEFAULT_PBT_ITERATIONS,
  REDUCED_PBT_ITERATIONS,
} from "./helpers.js";

export type { TestPackage } from "./helpers.js";
