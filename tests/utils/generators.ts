/**
 * Fast-check Generators for Property-Based Tests
 *
 * Reusable generators for generating test data across all property tests.
 * These generators produce valid inputs for testing ARN, SCIP, and documentation
 * functionality.
 *
 * @see Design Document: Testing Strategy - Test Data Generation
 */

import * as fc from "fast-check";
import type { ArnComponents, ArnType } from "../../src/types/arn.js";
import type { SymbolKind, RelationshipType, SymbolLocation, ScipSymbol, ScipRelationship } from "../../src/types/scip.js";
import { normalizePath } from "../../src/lib/arn.js";

// ============================================================================
// ARN Component Generators
// ============================================================================

/**
 * Valid ARN types as defined in Requirements 2.3
 */
export const VALID_ARN_TYPES: ArnType[] = ["code", "doc", "k8s", "infra"];

/**
 * Arbitrary for generating valid ARN types
 */
export const arnTypeArb: fc.Arbitrary<ArnType> = fc.constantFrom(...VALID_ARN_TYPES);

/**
 * Arbitrary for generating valid workspace names
 * - Non-empty strings
 * - No forward slashes (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No hash symbols (would break ARN parsing)
 */
export const workspaceArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating valid package names
 * - Non-empty strings
 * - No forward slashes (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No hash symbols (would break ARN parsing)
 */
export const packageNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating valid path segments
 * - Non-empty strings
 * - No hash symbols (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No slashes (would create extra path segments)
 * - Not just dots or whitespace (would normalize to empty)
 */
export const pathSegmentArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => s.trim().length > 0 && s !== "." && s !== ".." && !/^\.+$/.test(s));

/**
 * Arbitrary for generating valid file paths
 * - At least one segment
 * - Segments joined by forward slashes
 * - Path must not normalize to empty string
 */
export const filePathArb: fc.Arbitrary<string> = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join("/"))
  .filter((p) => normalizePath(p).length > 0);

/**
 * Arbitrary for generating valid symbol names
 * - Can contain special characters that will be escaped
 * - Non-empty strings
 */
export const symbolNameArb: fc.Arbitrary<string> = fc
  .stringOf(fc.char().filter((c) => c !== "\0"), { minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating alphanumeric symbol names (safer for most contexts)
 * - Starts with letter or underscore
 * - Contains only alphanumeric characters and underscores
 */
export const safeSymbolNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("")),
    fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split("")),
      { minLength: 0, maxLength: 29 }
    )
  )
  .map(([first, rest]) => first + rest);

/**
 * Arbitrary for generating optional symbol (undefined or valid symbol)
 */
export const optionalSymbolArb: fc.Arbitrary<string | undefined> = fc.option(symbolNameArb, { nil: undefined });

/**
 * Arbitrary for generating complete valid ARN components
 */
export const arnComponentsArb: fc.Arbitrary<ArnComponents> = fc.record({
  type: arnTypeArb,
  workspace: workspaceArb,
  package: packageNameArb,
  path: filePathArb,
  symbol: optionalSymbolArb,
});

/**
 * Arbitrary for generating ARN components with normalized paths
 * This ensures the path is already in canonical form for round-trip testing
 */
export const normalizedArnComponentsArb: fc.Arbitrary<ArnComponents> = fc.record({
  type: arnTypeArb,
  workspace: workspaceArb,
  package: packageNameArb,
  path: filePathArb.map((p) => normalizePath(p)),
  symbol: optionalSymbolArb,
});

/**
 * Arbitrary for generating valid ARN strings
 */
export const arnStringArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("code", "doc"),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 1, maxLength: 15 }),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 1, maxLength: 15 }),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz/_.".split("")), { minLength: 1, maxLength: 30 }),
    safeSymbolNameArb
  )
  .map(([type, workspace, pkg, path, symbol]) =>
    `arn:archon:${type}:${workspace}/${pkg}/${path}#${symbol}`
  );

// ============================================================================
// SCIP Symbol Generators
// ============================================================================

/**
 * Valid symbol kinds as defined in the SCIP types
 */
export const VALID_SYMBOL_KINDS: SymbolKind[] = [
  "function",
  "class",
  "method",
  "variable",
  "type",
  "module",
];

/**
 * Arbitrary for generating valid symbol kinds
 */
export const symbolKindArb: fc.Arbitrary<SymbolKind> = fc.constantFrom(...VALID_SYMBOL_KINDS);

/**
 * Valid relationship types as defined in the SCIP types
 */
export const VALID_RELATIONSHIP_TYPES: RelationshipType[] = [
  "contains",
  "references",
  "implements",
  "extends",
  "imports",
];

/**
 * Arbitrary for generating relationship types
 */
export const relationshipTypeArb: fc.Arbitrary<RelationshipType> = fc.constantFrom(...VALID_RELATIONSHIP_TYPES);

/**
 * Arbitrary for generating line numbers (1-indexed)
 */
export const lineNumberArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10000 });

/**
 * Arbitrary for generating column numbers (0-indexed)
 */
export const columnNumberArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 200 });

/**
 * Arbitrary for generating symbol locations
 */
export const symbolLocationArb: fc.Arbitrary<SymbolLocation> = fc.record({
  file: filePathArb,
  line: lineNumberArb,
  column: columnNumberArb,
});

/**
 * Arbitrary for generating optional documentation strings
 */
export const documentationArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ minLength: 1, maxLength: 200 }),
  { nil: undefined }
);

/**
 * Arbitrary for generating optional signature strings
 */
export const signatureArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }),
  { nil: undefined }
);

/**
 * Create a ScipSymbol from components
 */
export function createScipSymbol(
  name: string,
  kind: SymbolKind,
  filePath: string,
  line: number,
  column: number,
  documentation?: string,
  signature?: string
): ScipSymbol {
  return {
    name,
    kind,
    signature: signature || `${kind} ${name}`,
    documentation,
    location: {
      file: filePath,
      line,
      column,
    },
    arn: `arn:archon:code:workspace/package/${filePath}#${name}`,
  };
}

/**
 * Arbitrary for generating ScipSymbol objects
 */
export const scipSymbolArb: fc.Arbitrary<ScipSymbol> = fc
  .tuple(
    safeSymbolNameArb,
    symbolKindArb,
    filePathArb,
    lineNumberArb,
    columnNumberArb,
    documentationArb,
    signatureArb
  )
  .map(([name, kind, filePath, line, column, documentation, signature]) =>
    createScipSymbol(name, kind, filePath, line, column, documentation ?? undefined, signature ?? undefined)
  );

/**
 * Arbitrary for generating ScipRelationship objects
 */
export const scipRelationshipArb = (sourceArn: string): fc.Arbitrary<ScipRelationship> =>
  fc.tuple(arnStringArb, relationshipTypeArb).map(([targetArn, type]) => ({
    from: sourceArn,
    to: targetArn,
    type,
  }));

/**
 * Arbitrary for generating arrays of relationships for a symbol
 */
export const relationshipsArb = (sourceArn: string): fc.Arbitrary<ScipRelationship[]> =>
  fc.array(scipRelationshipArb(sourceArn), { minLength: 0, maxLength: 5 });

// ============================================================================
// File System Generators
// ============================================================================

/**
 * Common file extensions for source files
 */
export const FILE_EXTENSIONS = [
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".go",
  ".py",
  ".rs",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".cs",
] as const;

/**
 * Arbitrary for generating valid directory names
 * - Alphanumeric characters and underscores
 * - Non-empty strings
 * - No special characters that would break paths
 */
export const directoryNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("")),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0 && !s.startsWith("-"));

/**
 * Arbitrary for generating valid file names (without extension)
 * - Alphanumeric characters and underscores
 * - Non-empty strings
 * - Must start with a letter or underscore
 */
export const fileNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split("")),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => s.length > 0 && /^[a-zA-Z_]/.test(s));

/**
 * Arbitrary for generating file extensions
 */
export const extensionArb: fc.Arbitrary<string> = fc.constantFrom(...FILE_EXTENSIONS);

/**
 * Arbitrary for generating directory paths with variable depth (0-10 levels)
 * - Depth 0 means file is at root (no directory prefix)
 * - Depth 1-10 means nested directories
 */
export const directoryPathArb: fc.Arbitrary<string> = fc
  .array(directoryNameArb, { minLength: 0, maxLength: 10 })
  .map((segments) => (segments.length > 0 ? segments.join("/") : ""));

/**
 * Arbitrary for generating complete source file paths
 * Format: <dir>/<name>.<ext> or <name>.<ext> (if no directory)
 */
export const sourceFilePathArb: fc.Arbitrary<string> = fc
  .tuple(directoryPathArb, fileNameArb, extensionArb)
  .map(([dir, name, ext]) => {
    if (dir.length > 0) {
      return `${dir}/${name}${ext}`;
    }
    return `${name}${ext}`;
  });

// ============================================================================
// Package Structure Generators
// ============================================================================

/**
 * Package type enumeration for test generation
 */
export type PackageType = "go" | "typescript" | "both";

/**
 * Arbitrary for generating package types
 */
export const packageTypeArb: fc.Arbitrary<PackageType> = fc.constantFrom("go", "typescript", "both");

/**
 * Arbitrary for generating valid Go module names
 */
export const goModuleNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    { minLength: 1, maxLength: 15 }
  )
  .filter((s) => /^[a-z]/.test(s))
  .map((s) => `example.com/${s}`);

/**
 * Arbitrary for generating valid npm package names
 */
export const npmPackageNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => /^[a-z]/.test(s));

/**
 * Arbitrary for generating valid variable names (for code generation)
 */
export const variableNameArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
    { minLength: 1, maxLength: 10 }
  )
  .filter((s) => /^[a-zA-Z]/.test(s));

/**
 * Arbitrary for generating nesting depth (0-5 levels)
 * 0 = package at workspace root
 * 5 = package nested 5 directories deep
 */
export const nestingDepthArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5 });

/**
 * Arbitrary for generating the number of files to create
 */
export const fileCountArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10 });

// ============================================================================
// SCIP Index Generators
// ============================================================================

/**
 * SCIP Kind enum values (from SCIP protocol)
 */
export const ScipKind = {
  UnspecifiedKind: 0,
  Class: 7,
  Constructor: 9,
  Enum: 11,
  Field: 15,
  Function: 17,
  Interface: 21,
  Method: 27,
  Module: 28,
  Namespace: 29,
  Package: 34,
  Property: 39,
  Struct: 46,
  Trait: 51,
  TypeAlias: 52,
  Type: 56,
  Variable: 59,
} as const;

/**
 * Valid SCIP kinds that map to our SymbolKind
 */
export const VALID_SCIP_KINDS = [
  ScipKind.Class,
  ScipKind.Function,
  ScipKind.Method,
  ScipKind.Variable,
  ScipKind.Interface,
  ScipKind.Module,
  ScipKind.Type,
  ScipKind.Enum,
  ScipKind.Property,
] as const;

/**
 * Map SCIP kinds to our SymbolKind type
 */
export const SCIP_KIND_TO_SYMBOL_KIND: Record<number, SymbolKind> = {
  [ScipKind.Class]: "class",
  [ScipKind.Constructor]: "function",
  [ScipKind.Enum]: "type",
  [ScipKind.Field]: "variable",
  [ScipKind.Function]: "function",
  [ScipKind.Interface]: "type",
  [ScipKind.Method]: "method",
  [ScipKind.Module]: "module",
  [ScipKind.Namespace]: "module",
  [ScipKind.Package]: "module",
  [ScipKind.Property]: "variable",
  [ScipKind.Struct]: "type",
  [ScipKind.Trait]: "type",
  [ScipKind.TypeAlias]: "type",
  [ScipKind.Type]: "type",
  [ScipKind.Variable]: "variable",
};

/**
 * Arbitrary for generating valid SCIP kinds
 */
export const scipKindArb: fc.Arbitrary<number> = fc.constantFrom(...VALID_SCIP_KINDS);

/**
 * Arbitrary for generating valid SCIP symbol strings
 */
export const scipSymbolStringArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("scip-typescript", "scip-go", "scip-python"),
    fc.constantFrom("npm", "go", "pip"),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-".split("")), { minLength: 1, maxLength: 15 }),
    fc.constantFrom("1.0.0", "2.0.0", "0.1.0"),
    filePathArb,
    safeSymbolNameArb
  )
  .map(([tool, manager, pkg, version, path, symbol]) =>
    `${tool} ${manager} ${pkg} ${version} ${path} ${symbol}.`
  );

/**
 * Arbitrary for generating occurrence ranges
 * SCIP uses [line, startCol, endCol] for single-line ranges
 */
export const occurrenceRangeArb: fc.Arbitrary<number[]> = fc
  .tuple(
    fc.integer({ min: 0, max: 1000 }), // line (0-indexed in SCIP)
    columnNumberArb,
    columnNumberArb
  )
  .map(([line, startCol, endCol]) => [line, startCol, Math.max(startCol + 1, endCol)]);

// ============================================================================
// Documentation Generators
// ============================================================================

/**
 * Arbitrary for generating Go file names
 */
export const goFileNameArb: fc.Arbitrary<string> = fileNameArb.map((name) => `${name}.go`);

/**
 * Arbitrary for generating TypeScript file names
 */
export const tsFileNameArb: fc.Arbitrary<string> = fc
  .tuple(fileNameArb, fc.constantFrom(".ts", ".tsx", ".js", ".jsx"))
  .map(([name, ext]) => `${name}${ext}`);

/**
 * Arbitrary for generating unrelated file names (not Go or TypeScript markers)
 */
export const unrelatedFileNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fileNameArb,
    fc.constantFrom(".md", ".txt", ".yaml", ".json", ".xml", ".css", ".html", ".py", ".rb")
  )
  .map(([name, ext]) => `${name}${ext}`)
  .filter((name) => name !== "package.json");

/**
 * Arbitrary for generating Go module content
 */
export const goModContentArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    fc.constantFrom("1.18", "1.19", "1.20", "1.21", "1.22")
  )
  .map(([module, version]) => `module ${module}\n\ngo ${version}`);

/**
 * Arbitrary for generating package.json content
 */
export const packageJsonContentArb: fc.Arbitrary<string> = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    version: fc.constantFrom("1.0.0", "0.1.0", "2.0.0"),
  })
  .map((pkg) => JSON.stringify(pkg));

/**
 * Arbitrary for generating Go source file content
 */
export const goSourceContentArb: fc.Arbitrary<string> = fc.constantFrom(
  "package main\n\nfunc main() {}",
  "package utils\n\nfunc Helper() {}",
  "package test\n\nimport \"testing\"\n\nfunc TestExample(t *testing.T) {}"
);

/**
 * Arbitrary for generating TypeScript source file content
 */
export const tsSourceContentArb: fc.Arbitrary<string> = fc.constantFrom(
  "export const x = 1;",
  "export function helper() {}",
  "export type MyType = string;",
  "import { something } from './other';"
);

/**
 * Generate a minimal valid Go source file
 */
export function generateGoSource(functionName: string): string {
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
export function generateTypeScriptSource(variableName: string): string {
  return `export const ${variableName} = 1;
`;
}
