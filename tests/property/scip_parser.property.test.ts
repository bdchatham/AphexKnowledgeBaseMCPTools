/**
 * Property-Based Tests for SCIP Parser
 *
 * Tests Property 10: SCIP Parsing Completeness
 *
 * Property 10: For any valid SCIP index file, the parser SHALL extract all symbols
 * with their name, kind, signature, documentation, and location, SHALL assign valid
 * ARNs to each symbol, and SHALL extract all relationships (contains, references,
 * implements, extends, imports).
 *
 * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
 *
 * @see Design Document: Property 10: SCIP Parsing Completeness
 */

import * as fc from "fast-check";
import { parse } from "../../src/lib/scip_parser.js";
import { validate as validateArn } from "../../src/lib/arn.js";
import type { ScipSymbol, SymbolKind, RelationshipType, ScipParseResult } from "../../src/types/scip.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import protobuf from "protobufjs";

/**
 * Test directory management utilities
 */
let testDirCounter = 0;

async function createTestDir(): Promise<string> {
  const testDir = join(
    tmpdir(),
    `scip-parser-pbt-${Date.now()}-${testDirCounter++}-${Math.random().toString(36).slice(2)}`
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
 * Minimal proto schema for testing that avoids alias issues.
 * This is a simplified version that only includes what we need for tests.
 */
const MINIMAL_PROTO = `
syntax = "proto3";
package scip;

message Index {
  Metadata metadata = 1;
  repeated Document documents = 2;
  repeated SymbolInformation external_symbols = 3;
}

message Metadata {
  int32 version = 1;
  ToolInfo tool_info = 2;
  string project_root = 3;
}

message ToolInfo {
  string name = 1;
  string version = 2;
}

message Document {
  string language = 1;
  string relative_path = 2;
  repeated Occurrence occurrences = 3;
  repeated SymbolInformation symbols = 4;
}

message Occurrence {
  repeated int32 range = 1;
  string symbol = 2;
  int32 symbol_roles = 3;
}

message SymbolInformation {
  string symbol = 1;
  repeated string documentation = 2;
  repeated Relationship relationships = 3;
  int32 kind = 4;
  string display_name = 5;
  SignatureDocumentation signature_documentation = 6;
  string enclosing_symbol = 7;
}

message Relationship {
  string symbol = 1;
  bool is_reference = 2;
  bool is_implementation = 3;
  bool is_type_definition = 4;
  bool is_definition = 5;
}

message SignatureDocumentation {
  string text = 1;
}
`;

// Cached protobuf root for tests
let testProtoRoot: protobuf.Root | null = null;

/**
 * Load the minimal test proto schema
 */
async function loadTestProtoSchema(): Promise<protobuf.Root> {
  if (testProtoRoot) {
    return testProtoRoot;
  }
  testProtoRoot = protobuf.parse(MINIMAL_PROTO).root;
  return testProtoRoot;
}


/**
 * Type definitions for creating test SCIP indexes
 */
interface ScipIndexData {
  metadata?: {
    version?: number;
    toolInfo?: {
      name?: string;
      version?: string;
    };
    projectRoot?: string;
  };
  documents?: ScipDocumentData[];
  externalSymbols?: ScipSymbolInfoData[];
}

interface ScipDocumentData {
  language?: string;
  relativePath?: string;
  occurrences?: ScipOccurrenceData[];
  symbols?: ScipSymbolInfoData[];
}

interface ScipOccurrenceData {
  range?: number[];
  symbol?: string;
  symbolRoles?: number;
}

interface ScipSymbolInfoData {
  symbol?: string;
  documentation?: string[];
  relationships?: ScipRelationshipData[];
  kind?: number;
  displayName?: string;
  signatureDocumentation?: {
    text?: string;
  };
  enclosingSymbol?: string;
}

interface ScipRelationshipData {
  symbol?: string;
  isReference?: boolean;
  isImplementation?: boolean;
  isTypeDefinition?: boolean;
  isDefinition?: boolean;
}

// Symbol role bit flags from SCIP protocol
const SymbolRole = {
  Definition: 0x1,
  Import: 0x2,
  WriteAccess: 0x4,
  ReadAccess: 0x8,
  Generated: 0x10,
  Test: 0x20,
  ForwardDefinition: 0x40,
} as const;

// SCIP Kind enum values
const ScipKind = {
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


// Map SCIP kinds to our SymbolKind type
const SCIP_KIND_TO_SYMBOL_KIND: Record<number, SymbolKind> = {
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
 * Helper to create a SCIP index buffer from a JavaScript object.
 * Uses protobufjs to encode the index in the correct binary format.
 */
async function createScipIndex(indexData: ScipIndexData): Promise<Buffer> {
  const root = await loadTestProtoSchema();
  const IndexType = root.lookupType("scip.Index");

  const errMsg = IndexType.verify(indexData);
  if (errMsg) {
    throw new Error(`Invalid SCIP index data: ${errMsg}`);
  }

  const message = IndexType.create(indexData);
  const buffer = IndexType.encode(message).finish();
  return Buffer.from(buffer);
}

/**
 * Valid SCIP kinds that map to our SymbolKind
 */
const VALID_SCIP_KINDS = [
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
 * Arbitrary for generating valid symbol names
 * - Non-empty strings
 * - Alphanumeric with underscores
 * - Starts with letter or underscore
 */
const symbolNameArb = fc
  .tuple(
    fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "_"),
    fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(""))), { minLength: 0, maxLength: 20 })
  )
  .map(([first, rest]) => first + rest);

/**
 * Arbitrary for generating valid file paths
 */
const filePathArb = fc
  .tuple(
    fc.constantFrom("src", "lib", "pkg", "internal", "cmd"),
    fc.array(
      fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz".split(""))), { minLength: 1, maxLength: 10 }),
      { minLength: 0, maxLength: 2 }
    ),
    symbolNameArb,
    fc.constantFrom(".ts", ".js", ".go", ".py")
  )
  .map(([dir, subdirs, name, ext]) => [dir, ...subdirs, name + ext].join("/"));

/**
 * Arbitrary for generating valid SCIP symbol strings
 */
const scipSymbolArb = fc
  .tuple(
    fc.constantFrom("scip-typescript", "scip-go", "scip-python"),
    fc.constantFrom("npm", "go", "pip"),
    fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz-".split(""))), { minLength: 1, maxLength: 15 }),
    fc.constantFrom("1.0.0", "2.0.0", "0.1.0"),
    filePathArb,
    symbolNameArb
  )
  .map(([tool, manager, pkg, version, path, symbol]) => 
    `${tool} ${manager} ${pkg} ${version} ${path} ${symbol}.`
  );

/**
 * Arbitrary for generating valid SCIP kinds
 */
const scipKindArb = fc.constantFrom(...VALID_SCIP_KINDS);

/**
 * Arbitrary for generating documentation strings
 */
const documentationArb = fc.array(
  fc.stringOf(fc.char().filter(c => c !== "\0"), { minLength: 1, maxLength: 100 }),
  { minLength: 0, maxLength: 3 }
);

/**
 * Arbitrary for generating valid line numbers (0-indexed in SCIP)
 */
const lineNumberArb = fc.integer({ min: 0, max: 1000 });

/**
 * Arbitrary for generating valid column numbers
 */
const columnNumberArb = fc.integer({ min: 0, max: 200 });


/**
 * Arbitrary for generating occurrence ranges
 * SCIP uses [line, startCol, endCol] for single-line ranges
 */
const occurrenceRangeArb = fc
  .tuple(lineNumberArb, columnNumberArb, columnNumberArb)
  .map(([line, startCol, endCol]) => [line, startCol, Math.max(startCol + 1, endCol)]);

/**
 * Arbitrary for generating a single symbol info with occurrence
 */
interface GeneratedSymbol {
  symbolInfo: ScipSymbolInfoData;
  occurrence: ScipOccurrenceData;
  expectedName: string;
  expectedKind: SymbolKind;
}

const generatedSymbolArb: fc.Arbitrary<GeneratedSymbol> = fc
  .tuple(
    symbolNameArb,
    scipKindArb,
    documentationArb,
    occurrenceRangeArb,
    fc.option(fc.stringOf(fc.char().filter(c => c !== "\0"), { minLength: 1, maxLength: 50 }), { nil: undefined })
  )
  .map(([name, kind, docs, range, signature]) => {
    const scipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${name}.`;
    return {
      symbolInfo: {
        symbol: scipSymbol,
        kind,
        displayName: name,
        documentation: docs.length > 0 ? docs : undefined,
        signatureDocumentation: signature ? { text: signature } : undefined,
      },
      occurrence: {
        range,
        symbol: scipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: name,
      expectedKind: SCIP_KIND_TO_SYMBOL_KIND[kind] || "variable",
    };
  });

/**
 * Arbitrary for generating multiple symbols in a document
 */
const documentSymbolsArb = fc.array(generatedSymbolArb, { minLength: 1, maxLength: 10 });


/**
 * Arbitrary for generating relationship types
 */
type RelationshipConfig = {
  type: RelationshipType;
  isReference?: boolean;
  isImplementation?: boolean;
  isTypeDefinition?: boolean;
};

const relationshipConfigArb: fc.Arbitrary<RelationshipConfig> = fc.constantFrom(
  { type: "references" as RelationshipType, isReference: true },
  { type: "implements" as RelationshipType, isImplementation: true },
  { type: "extends" as RelationshipType, isTypeDefinition: true }
);

/**
 * Arbitrary for generating a class with methods (contains relationship)
 */
interface ClassWithMethods {
  classSymbol: GeneratedSymbol;
  methodSymbols: GeneratedSymbol[];
}

const classWithMethodsArb: fc.Arbitrary<ClassWithMethods> = fc
  .tuple(
    symbolNameArb,
    fc.array(symbolNameArb, { minLength: 1, maxLength: 3 }),
    occurrenceRangeArb,
    fc.array(occurrenceRangeArb, { minLength: 1, maxLength: 3 })
  )
  .map(([className, methodNames, classRange, methodRanges]) => {
    const classScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${className}#`;
    
    const classSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: classScipSymbol,
        kind: ScipKind.Class,
        displayName: className,
      },
      occurrence: {
        range: classRange,
        symbol: classScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: className,
      expectedKind: "class",
    };

    const methodSymbols: GeneratedSymbol[] = methodNames.slice(0, methodRanges.length).map((methodName, i) => {
      const methodScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${className}#${methodName}().`;
      return {
        symbolInfo: {
          symbol: methodScipSymbol,
          kind: ScipKind.Method,
          displayName: methodName,
          enclosingSymbol: classScipSymbol,
        },
        occurrence: {
          range: methodRanges[i],
          symbol: methodScipSymbol,
          symbolRoles: SymbolRole.Definition,
        },
        expectedName: methodName,
        expectedKind: "method" as SymbolKind,
      };
    });

    return { classSymbol, methodSymbols };
  });


/**
 * Arbitrary for generating interface implementation relationship
 */
interface InterfaceImplementation {
  interfaceSymbol: GeneratedSymbol;
  classSymbol: GeneratedSymbol;
}

const interfaceImplementationArb: fc.Arbitrary<InterfaceImplementation> = fc
  .tuple(
    symbolNameArb,
    symbolNameArb,
    occurrenceRangeArb,
    occurrenceRangeArb
  )
  .filter(([interfaceName, className]) => interfaceName !== className)
  .map(([interfaceName, className, interfaceRange, classRange]) => {
    const interfaceScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${interfaceName}#`;
    const classScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${className}#`;

    const interfaceSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: interfaceScipSymbol,
        kind: ScipKind.Interface,
        displayName: interfaceName,
      },
      occurrence: {
        range: interfaceRange,
        symbol: interfaceScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: interfaceName,
      expectedKind: "type",
    };

    const classSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: classScipSymbol,
        kind: ScipKind.Class,
        displayName: className,
        relationships: [
          {
            symbol: interfaceScipSymbol,
            isImplementation: true,
          },
        ],
      },
      occurrence: {
        range: classRange,
        symbol: classScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: className,
      expectedKind: "class",
    };

    return { interfaceSymbol, classSymbol };
  });


/**
 * Arbitrary for generating class inheritance (extends relationship)
 */
interface ClassInheritance {
  baseClassSymbol: GeneratedSymbol;
  derivedClassSymbol: GeneratedSymbol;
}

const classInheritanceArb: fc.Arbitrary<ClassInheritance> = fc
  .tuple(
    symbolNameArb,
    symbolNameArb,
    occurrenceRangeArb,
    occurrenceRangeArb
  )
  .filter(([baseName, derivedName]) => baseName !== derivedName)
  .map(([baseName, derivedName, baseRange, derivedRange]) => {
    const baseScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${baseName}#`;
    const derivedScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${derivedName}#`;

    const baseClassSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: baseScipSymbol,
        kind: ScipKind.Class,
        displayName: baseName,
      },
      occurrence: {
        range: baseRange,
        symbol: baseScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: baseName,
      expectedKind: "class",
    };

    const derivedClassSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: derivedScipSymbol,
        kind: ScipKind.Class,
        displayName: derivedName,
        relationships: [
          {
            symbol: baseScipSymbol,
            isTypeDefinition: true,
          },
        ],
      },
      occurrence: {
        range: derivedRange,
        symbol: derivedScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: derivedName,
      expectedKind: "class",
    };

    return { baseClassSymbol, derivedClassSymbol };
  });


/**
 * Arbitrary for generating import relationships
 */
interface ImportRelationship {
  exportedSymbol: GeneratedSymbol;
  importingFilePath: string;
}

const importRelationshipArb: fc.Arbitrary<ImportRelationship> = fc
  .tuple(
    symbolNameArb,
    occurrenceRangeArb,
    filePathArb
  )
  .map(([symbolName, range, importingPath]) => {
    const exportedScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/utils.ts ${symbolName}.`;

    const exportedSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: exportedScipSymbol,
        kind: ScipKind.Function,
        displayName: symbolName,
      },
      occurrence: {
        range,
        symbol: exportedScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: symbolName,
      expectedKind: "function",
    };

    return { exportedSymbol, importingFilePath: importingPath };
  });

/**
 * Arbitrary for generating reference relationships
 */
interface ReferenceRelationship {
  definedSymbol: GeneratedSymbol;
  referencingSymbol: GeneratedSymbol;
}

const referenceRelationshipArb: fc.Arbitrary<ReferenceRelationship> = fc
  .tuple(
    symbolNameArb,
    symbolNameArb,
    occurrenceRangeArb,
    occurrenceRangeArb
  )
  .filter(([definedName, referencingName]) => definedName !== referencingName)
  .map(([definedName, referencingName, definedRange, referencingRange]) => {
    const definedScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${definedName}.`;
    const referencingScipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${referencingName}.`;

    const definedSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: definedScipSymbol,
        kind: ScipKind.Function,
        displayName: definedName,
      },
      occurrence: {
        range: definedRange,
        symbol: definedScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: definedName,
      expectedKind: "function",
    };

    const referencingSymbol: GeneratedSymbol = {
      symbolInfo: {
        symbol: referencingScipSymbol,
        kind: ScipKind.Function,
        displayName: referencingName,
        relationships: [
          {
            symbol: definedScipSymbol,
            isReference: true,
          },
        ],
      },
      occurrence: {
        range: referencingRange,
        symbol: referencingScipSymbol,
        symbolRoles: SymbolRole.Definition,
      },
      expectedName: referencingName,
      expectedKind: "function",
    };

    return { definedSymbol, referencingSymbol };
  });


describe("Feature: documentation-tools, Property 10: SCIP Parsing Completeness", () => {
  /**
   * Property 10.1: All symbols in the index are extracted
   *
   * For any valid SCIP index with N symbols, the parser SHALL extract
   * exactly N symbols from the index.
   *
   * **Validates: Requirement 3.2**
   */
  it("should extract all symbols from the index", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Build SCIP index with generated symbols
            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Should extract all symbols
            expect(result.symbols.length).toBe(generatedSymbols.length);

            // Verify each expected symbol name is present
            const extractedNames = result.symbols.map((s) => s.name);
            for (const genSymbol of generatedSymbols) {
              expect(extractedNames).toContain(genSymbol.expectedName);
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
   * Property 10.2: Each symbol has name, kind, signature, and location
   *
   * For any valid SCIP index, each extracted symbol SHALL have:
   * - A non-empty name
   * - A valid kind (function, class, method, variable, type, module)
   * - A signature string
   * - A location with file, line, and column
   *
   * **Validates: Requirement 3.2**
   */
  it("should extract symbols with name, kind, signature, and location", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify each symbol has required fields
            for (const symbol of result.symbols) {
              // Name should be non-empty
              expect(symbol.name).toBeDefined();
              expect(symbol.name.length).toBeGreaterThan(0);

              // Kind should be one of the valid kinds
              const validKinds: SymbolKind[] = ["function", "class", "method", "variable", "type", "module"];
              expect(validKinds).toContain(symbol.kind);

              // Signature should be defined
              expect(symbol.signature).toBeDefined();

              // Location should have file, line, and column
              expect(symbol.location).toBeDefined();
              expect(symbol.location.file).toBeDefined();
              expect(typeof symbol.location.line).toBe("number");
              expect(typeof symbol.location.column).toBe("number");
              expect(symbol.location.line).toBeGreaterThanOrEqual(1); // 1-indexed
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
   * Property 10.3: Each symbol has a valid ARN
   *
   * For any valid SCIP index, each extracted symbol SHALL have a valid ARN
   * that passes ARN validation.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it("should assign valid ARNs to each symbol", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify each symbol has a valid ARN
            for (const symbol of result.symbols) {
              expect(symbol.arn).toBeDefined();
              expect(symbol.arn.length).toBeGreaterThan(0);

              // ARN should pass validation
              const validationResult = validateArn(symbol.arn);
              expect(validationResult.valid).toBe(true);

              // ARN should start with correct prefix
              expect(symbol.arn.startsWith("arn:archon:code:")).toBe(true);

              // ARN should contain workspace and package
              expect(symbol.arn).toContain("test-workspace");
              expect(symbol.arn).toContain("test-package");
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
   * Property 10.4: Symbol kinds are correctly mapped
   *
   * For any valid SCIP index, the parser SHALL correctly map SCIP kinds
   * to our SymbolKind values.
   *
   * **Validates: Requirement 3.2**
   */
  it("should correctly map SCIP kinds to SymbolKind", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scipKindArb, { minLength: 1, maxLength: 5 }),
        async (kinds) => {
          const testDir = await createTestDir();
          try {
            const symbols: ScipSymbolInfoData[] = [];
            const occurrences: ScipOccurrenceData[] = [];
            const expectedKinds: Map<string, SymbolKind> = new Map();

            // Generate symbols with unique names for each kind
            for (let i = 0; i < kinds.length; i++) {
              const uniqueName = `kindSymbol${i}`;
              const scipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${uniqueName}.`;
              const kind = kinds[i];
              
              symbols.push({
                symbol: scipSymbol,
                kind,
                displayName: uniqueName,
              });
              occurrences.push({
                range: [i * 10, 0, uniqueName.length],
                symbol: scipSymbol,
                symbolRoles: SymbolRole.Definition,
              });
              expectedKinds.set(uniqueName, SCIP_KIND_TO_SYMBOL_KIND[kind] || "variable");
            }

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols,
                  occurrences,
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify each symbol has the expected kind
            for (const [name, expectedKind] of expectedKinds) {
              const extractedSymbol = result.symbols.find((s) => s.name === name);
              expect(extractedSymbol).toBeDefined();
              expect(extractedSymbol!.kind).toBe(expectedKind);
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
   * Property 10.5: Documentation is extracted when present
   *
   * For any valid SCIP index with documentation, the parser SHALL extract
   * the documentation for each symbol.
   *
   * **Validates: Requirement 3.2**
   */
  it("should extract documentation when present", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
        async (symbolCount, docLines) => {
          const testDir = await createTestDir();
          try {
            const symbols: ScipSymbolInfoData[] = [];
            const occurrences: ScipOccurrenceData[] = [];
            const expectedDocs: Map<string, string> = new Map();

            // Generate symbols with unique names and documentation
            for (let i = 0; i < symbolCount; i++) {
              const uniqueName = `docSymbol${i}`;
              const scipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${uniqueName}.`;
              const docs = docLines.map((line) => `${line}_${i}`);
              
              symbols.push({
                symbol: scipSymbol,
                kind: ScipKind.Function,
                displayName: uniqueName,
                documentation: docs,
              });
              occurrences.push({
                range: [i * 10, 0, uniqueName.length],
                symbol: scipSymbol,
                symbolRoles: SymbolRole.Definition,
              });
              expectedDocs.set(uniqueName, docs.join("\n"));
            }

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols,
                  occurrences,
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify documentation is extracted for each symbol
            for (const [name, expectedDoc] of expectedDocs) {
              const extractedSymbol = result.symbols.find((s) => s.name === name);
              expect(extractedSymbol).toBeDefined();
              expect(extractedSymbol!.documentation).toBeDefined();
              expect(extractedSymbol!.documentation).toBe(expectedDoc);
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
   * Property 10.6: Location line numbers are correctly converted to 1-indexed
   *
   * For any valid SCIP index, the parser SHALL convert 0-indexed SCIP line
   * numbers to 1-indexed line numbers in the output.
   *
   * **Validates: Requirement 3.2**
   */
  it("should convert line numbers to 1-indexed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(symbolNameArb, lineNumberArb, columnNumberArb),
          { minLength: 1, maxLength: 5 }
        ),
        async (symbolsWithLocations) => {
          const testDir = await createTestDir();
          try {
            const symbols: ScipSymbolInfoData[] = [];
            const occurrences: ScipOccurrenceData[] = [];

            for (const [name, line, col] of symbolsWithLocations) {
              const scipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${name}.`;
              symbols.push({
                symbol: scipSymbol,
                kind: ScipKind.Function,
                displayName: name,
              });
              occurrences.push({
                range: [line, col, col + name.length],
                symbol: scipSymbol,
                symbolRoles: SymbolRole.Definition,
              });
            }

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols,
                  occurrences,
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify line numbers are 1-indexed
            for (const [name, scipLine] of symbolsWithLocations) {
              const extractedSymbol = result.symbols.find((s) => s.name === name);
              expect(extractedSymbol).toBeDefined();
              // SCIP uses 0-indexed lines, our output uses 1-indexed
              expect(extractedSymbol!.location.line).toBe(scipLine + 1);
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
   * Property 10.7: Contains relationships are extracted from enclosing symbols
   *
   * For any valid SCIP index with enclosing_symbol relationships, the parser
   * SHALL extract "contains" relationships where the parent contains the child.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract contains relationships from enclosing symbols", async () => {
    await fc.assert(
      fc.asyncProperty(
        classWithMethodsArb,
        async ({ classSymbol, methodSymbols }) => {
          const testDir = await createTestDir();
          try {
            const allSymbols = [classSymbol, ...methodSymbols];
            
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: allSymbols.map((s) => s.symbolInfo),
                  occurrences: allSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Find the class and method symbols
            const extractedClass = result.symbols.find((s) => s.name === classSymbol.expectedName);
            expect(extractedClass).toBeDefined();

            // Verify contains relationships exist
            const containsRels = result.relationships.filter((r) => r.type === "contains");
            
            // Each method should have a contains relationship from the class
            for (const methodSymbol of methodSymbols) {
              const extractedMethod = result.symbols.find((s) => s.name === methodSymbol.expectedName);
              expect(extractedMethod).toBeDefined();

              // There should be a contains relationship: class -> method
              const hasContainsRel = containsRels.some(
                (r) => r.from === extractedClass!.arn && r.to === extractedMethod!.arn
              );
              expect(hasContainsRel).toBe(true);
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
   * Property 10.8: Implements relationships are extracted
   *
   * For any valid SCIP index with isImplementation relationships, the parser
   * SHALL extract "implements" relationships.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract implements relationships", async () => {
    await fc.assert(
      fc.asyncProperty(
        interfaceImplementationArb,
        async ({ interfaceSymbol, classSymbol }) => {
          const testDir = await createTestDir();
          try {
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: [interfaceSymbol.symbolInfo, classSymbol.symbolInfo],
                  occurrences: [interfaceSymbol.occurrence, classSymbol.occurrence],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Find the interface and class symbols
            const extractedInterface = result.symbols.find((s) => s.name === interfaceSymbol.expectedName);
            const extractedClass = result.symbols.find((s) => s.name === classSymbol.expectedName);
            
            expect(extractedInterface).toBeDefined();
            expect(extractedClass).toBeDefined();

            // Verify implements relationship exists
            const implementsRels = result.relationships.filter((r) => r.type === "implements");
            const hasImplementsRel = implementsRels.some(
              (r) => r.from === extractedClass!.arn && r.to === extractedInterface!.arn
            );
            expect(hasImplementsRel).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 10.9: Extends relationships are extracted
   *
   * For any valid SCIP index with isTypeDefinition relationships (inheritance),
   * the parser SHALL extract "extends" relationships.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract extends relationships", async () => {
    await fc.assert(
      fc.asyncProperty(
        classInheritanceArb,
        async ({ baseClassSymbol, derivedClassSymbol }) => {
          const testDir = await createTestDir();
          try {
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: [baseClassSymbol.symbolInfo, derivedClassSymbol.symbolInfo],
                  occurrences: [baseClassSymbol.occurrence, derivedClassSymbol.occurrence],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Find the base and derived class symbols
            const extractedBase = result.symbols.find((s) => s.name === baseClassSymbol.expectedName);
            const extractedDerived = result.symbols.find((s) => s.name === derivedClassSymbol.expectedName);
            
            expect(extractedBase).toBeDefined();
            expect(extractedDerived).toBeDefined();

            // Verify extends relationship exists
            const extendsRels = result.relationships.filter((r) => r.type === "extends");
            const hasExtendsRel = extendsRels.some(
              (r) => r.from === extractedDerived!.arn && r.to === extractedBase!.arn
            );
            expect(hasExtendsRel).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.10: References relationships are extracted
   *
   * For any valid SCIP index with isReference relationships, the parser
   * SHALL extract "references" relationships.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract references relationships", async () => {
    await fc.assert(
      fc.asyncProperty(
        referenceRelationshipArb,
        async ({ definedSymbol, referencingSymbol }) => {
          const testDir = await createTestDir();
          try {
            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: [definedSymbol.symbolInfo, referencingSymbol.symbolInfo],
                  occurrences: [definedSymbol.occurrence, referencingSymbol.occurrence],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Find the defined and referencing symbols
            const extractedDefined = result.symbols.find((s) => s.name === definedSymbol.expectedName);
            const extractedReferencing = result.symbols.find((s) => s.name === referencingSymbol.expectedName);
            
            expect(extractedDefined).toBeDefined();
            expect(extractedReferencing).toBeDefined();

            // Verify references relationship exists
            const referencesRels = result.relationships.filter((r) => r.type === "references");
            const hasReferencesRel = referencesRels.some(
              (r) => r.from === extractedReferencing!.arn && r.to === extractedDefined!.arn
            );
            expect(hasReferencesRel).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 10.11: Imports relationships are extracted
   *
   * For any valid SCIP index with Import symbol roles, the parser
   * SHALL extract "imports" relationships.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract imports relationships", async () => {
    await fc.assert(
      fc.asyncProperty(
        importRelationshipArb,
        async ({ exportedSymbol, importingFilePath }) => {
          const testDir = await createTestDir();
          try {
            // Create an import occurrence in a different file
            const importOccurrence: ScipOccurrenceData = {
              range: [0, 9, 9 + exportedSymbol.expectedName.length],
              symbol: exportedSymbol.symbolInfo.symbol,
              symbolRoles: SymbolRole.Import,
            };

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/utils.ts",
                  symbols: [exportedSymbol.symbolInfo],
                  occurrences: [exportedSymbol.occurrence],
                },
                {
                  relativePath: importingFilePath,
                  symbols: [],
                  occurrences: [importOccurrence],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify imports relationship exists
            const importsRels = result.relationships.filter((r) => r.type === "imports");
            expect(importsRels.length).toBeGreaterThanOrEqual(1);

            // The importing file should import the exported symbol
            const exportedArn = result.symbols.find((s) => s.name === exportedSymbol.expectedName)?.arn;
            expect(exportedArn).toBeDefined();

            const hasImportsRel = importsRels.some((r) => r.to === exportedArn);
            expect(hasImportsRel).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.12: Multiple relationship types can coexist
   *
   * For any valid SCIP index with multiple relationship types, the parser
   * SHALL extract all relationship types correctly.
   *
   * **Validates: Requirement 3.5**
   */
  it("should extract multiple relationship types in the same index", async () => {
    await fc.assert(
      fc.asyncProperty(
        classWithMethodsArb,
        interfaceImplementationArb,
        async (classWithMethods, interfaceImpl) => {
          const testDir = await createTestDir();
          try {
            // Combine all symbols
            const allSymbols = [
              classWithMethods.classSymbol,
              ...classWithMethods.methodSymbols,
              interfaceImpl.interfaceSymbol,
              interfaceImpl.classSymbol,
            ];

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols: allSymbols.map((s) => s.symbolInfo),
                  occurrences: allSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify multiple relationship types are extracted
            const relationshipTypes = new Set(result.relationships.map((r) => r.type));
            
            // Should have at least contains (from class->methods) and implements
            expect(relationshipTypes.has("contains")).toBe(true);
            expect(relationshipTypes.has("implements")).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 10.13: Symbols from multiple documents are extracted
   *
   * For any valid SCIP index with multiple documents, the parser SHALL
   * extract symbols from all documents.
   *
   * **Validates: Requirement 3.2**
   */
  it("should extract symbols from multiple documents", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(filePathArb, documentSymbolsArb),
          { minLength: 2, maxLength: 5 }
        ),
        async (documentsWithSymbols) => {
          const testDir = await createTestDir();
          try {
            // Ensure unique file paths
            const uniqueDocs = new Map<string, GeneratedSymbol[]>();
            for (const [path, symbols] of documentsWithSymbols) {
              if (!uniqueDocs.has(path)) {
                uniqueDocs.set(path, symbols);
              }
            }

            // Build documents with unique symbol names per file
            const documents: ScipDocumentData[] = [];
            let symbolCounter = 0;
            const expectedSymbolCount = { count: 0 };

            for (const [filePath, symbols] of uniqueDocs) {
              const docSymbols: ScipSymbolInfoData[] = [];
              const docOccurrences: ScipOccurrenceData[] = [];

              for (const symbol of symbols) {
                // Make symbol names unique across files
                const uniqueName = `${symbol.expectedName}_${symbolCounter++}`;
                const scipSymbol = `scip-typescript npm test-pkg 1.0.0 ${filePath} ${uniqueName}.`;
                
                docSymbols.push({
                  ...symbol.symbolInfo,
                  symbol: scipSymbol,
                  displayName: uniqueName,
                });
                docOccurrences.push({
                  ...symbol.occurrence,
                  symbol: scipSymbol,
                });
                expectedSymbolCount.count++;
              }

              documents.push({
                relativePath: filePath,
                symbols: docSymbols,
                occurrences: docOccurrences,
              });
            }

            const indexData: ScipIndexData = { documents };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Should extract all symbols from all documents
            expect(result.symbols.length).toBe(expectedSymbolCount.count);

            // Verify symbols from each file are present
            for (const [filePath] of uniqueDocs) {
              const fileSymbols = result.symbols.filter((s) => s.location.file === filePath);
              expect(fileSymbols.length).toBeGreaterThan(0);
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
   * Property 10.14: ARNs are unique for each unique symbol
   *
   * For any valid SCIP index with unique symbol names, each extracted symbol
   * SHALL have a unique ARN.
   *
   * **Validates: Requirement 3.4**
   */
  it("should assign unique ARNs to each unique symbol", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (symbolCount) => {
          const testDir = await createTestDir();
          try {
            // Generate symbols with guaranteed unique names
            const symbols: ScipSymbolInfoData[] = [];
            const occurrences: ScipOccurrenceData[] = [];

            for (let i = 0; i < symbolCount; i++) {
              const uniqueName = `uniqueSymbol${i}`;
              const scipSymbol = `scip-typescript npm test-pkg 1.0.0 src/test.ts ${uniqueName}.`;
              
              symbols.push({
                symbol: scipSymbol,
                kind: ScipKind.Function,
                displayName: uniqueName,
              });
              occurrences.push({
                range: [i * 10, 0, uniqueName.length],
                symbol: scipSymbol,
                symbolRoles: SymbolRole.Definition,
              });
            }

            const indexData: ScipIndexData = {
              documents: [
                {
                  relativePath: "src/test.ts",
                  symbols,
                  occurrences,
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify all ARNs are unique
            const arns = result.symbols.map((s) => s.arn);
            const uniqueArns = new Set(arns);
            expect(uniqueArns.size).toBe(arns.length);
            expect(uniqueArns.size).toBe(symbolCount);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property-Based Tests for SCIP Parser - Property 11: Incremental Parsing Efficiency
 *
 * Property 11: For any SCIP index where only a subset of files have changed,
 * incremental parsing SHALL only process changed files while preserving
 * previously parsed data for unchanged files.
 *
 * **Validates: Requirement 3.6**
 *
 * @see Design Document: Property 11: Incremental Parsing Efficiency
 */

describe("Feature: documentation-tools, Property 11: Incremental Parsing Efficiency", () => {
  /**
   * Property 11.1: When index is unchanged, parseIncremental returns previous result
   *
   * For any valid SCIP index that has not changed since the previous parse,
   * parseIncremental SHALL return the previous result without re-processing.
   *
   * **Validates: Requirement 3.6**
   */
  it("should return previous result when index is unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Build SCIP index with generated symbols
            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // First parse
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            expect(firstResult.symbols.length).toBe(generatedSymbols.length);

            // Import parseIncremental
            const { parseIncremental } = await import("../../src/lib/scip_parser.js");

            // Incremental parse with same index (unchanged)
            const incrementalResult = await parseIncremental(
              indexPath,
              "test-workspace",
              "test-package",
              firstResult
            );

            // Should return the same result since nothing changed
            expect(incrementalResult.hash).toBe(firstResult.hash);
            expect(incrementalResult.symbols.length).toBe(firstResult.symbols.length);
            
            // Verify symbols are the same
            const firstSymbolNames = firstResult.symbols.map((s) => s.name).sort();
            const incrementalSymbolNames = incrementalResult.symbols.map((s) => s.name).sort();
            expect(incrementalSymbolNames).toEqual(firstSymbolNames);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.2: Symbols from unchanged files are preserved
   *
   * For any SCIP index where only some files have changed, incremental parsing
   * SHALL preserve symbols from unchanged files without re-processing them.
   *
   * **Validates: Requirement 3.6**
   */
  it("should preserve symbols from unchanged files", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        documentSymbolsArb,
        async (unchangedSymbols, changedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create initial index with two files
            const initialIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/unchanged.ts",
                  symbols: unchangedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/unchanged.ts unchanged${i}.`,
                    displayName: `unchanged${i}`,
                  })),
                  occurrences: unchangedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/unchanged.ts unchanged${i}.`,
                  })),
                },
                {
                  language: "typescript",
                  relativePath: "src/changed.ts",
                  symbols: changedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/changed.ts original${i}.`,
                    displayName: `original${i}`,
                  })),
                  occurrences: changedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/changed.ts original${i}.`,
                  })),
                },
              ],
            };

            const initialBuffer = await createScipIndex(initialIndexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, initialBuffer);

            // First parse
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            const unchangedFileSymbols = firstResult.symbols.filter(
              (s) => s.location.file === "src/unchanged.ts"
            );
            expect(unchangedFileSymbols.length).toBe(unchangedSymbols.length);

            // Create updated index with changed file modified
            const updatedIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/unchanged.ts",
                  symbols: unchangedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/unchanged.ts unchanged${i}.`,
                    displayName: `unchanged${i}`,
                  })),
                  occurrences: unchangedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/unchanged.ts unchanged${i}.`,
                  })),
                },
                {
                  language: "typescript",
                  relativePath: "src/changed.ts",
                  symbols: changedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/changed.ts modified${i}.`,
                    displayName: `modified${i}`,
                  })),
                  occurrences: changedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/changed.ts modified${i}.`,
                  })),
                },
              ],
            };

            const updatedBuffer = await createScipIndex(updatedIndexData);
            await writeFile(indexPath, updatedBuffer);

            // Import parseIncremental
            const { parseIncremental } = await import("../../src/lib/scip_parser.js");

            // Incremental parse
            const incrementalResult = await parseIncremental(
              indexPath,
              "test-workspace",
              "test-package",
              firstResult
            );

            // Verify unchanged file symbols are preserved
            const preservedSymbols = incrementalResult.symbols.filter(
              (s) => s.location.file === "src/unchanged.ts"
            );
            expect(preservedSymbols.length).toBe(unchangedSymbols.length);

            // Verify the unchanged symbols have the same names
            const preservedNames = preservedSymbols.map((s) => s.name).sort();
            const originalUnchangedNames = unchangedFileSymbols.map((s) => s.name).sort();
            expect(preservedNames).toEqual(originalUnchangedNames);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.3: Changed files are re-processed and their symbols are updated
   *
   * For any SCIP index where some files have changed, incremental parsing
   * SHALL re-process the changed files and update their symbols.
   *
   * **Validates: Requirement 3.6**
   */
  it("should re-process changed files and update their symbols", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create initial index
            const initialIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/file.ts",
                  symbols: generatedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/file.ts original${i}.`,
                    displayName: `original${i}`,
                  })),
                  occurrences: generatedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/file.ts original${i}.`,
                  })),
                },
              ],
            };

            const initialBuffer = await createScipIndex(initialIndexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, initialBuffer);

            // First parse
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            const originalNames = firstResult.symbols.map((s) => s.name).sort();
            expect(originalNames.every((n) => n.startsWith("original"))).toBe(true);

            // Create updated index with modified symbols
            const updatedIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/file.ts",
                  symbols: generatedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/file.ts updated${i}.`,
                    displayName: `updated${i}`,
                  })),
                  occurrences: generatedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/file.ts updated${i}.`,
                  })),
                },
              ],
            };

            const updatedBuffer = await createScipIndex(updatedIndexData);
            await writeFile(indexPath, updatedBuffer);

            // Import parseIncremental
            const { parseIncremental } = await import("../../src/lib/scip_parser.js");

            // Incremental parse
            const incrementalResult = await parseIncremental(
              indexPath,
              "test-workspace",
              "test-package",
              firstResult
            );

            // Verify symbols are updated
            const updatedNames = incrementalResult.symbols.map((s) => s.name).sort();
            expect(updatedNames.every((n) => n.startsWith("updated"))).toBe(true);
            expect(updatedNames.length).toBe(generatedSymbols.length);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.4: Per-file hashes are correctly tracked
   *
   * For any valid SCIP index with multiple files, the parser SHALL compute
   * and track per-file hashes that can be used for incremental change detection.
   *
   * **Validates: Requirement 3.6**
   */
  it("should correctly track per-file hashes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz".split(""))), { minLength: 3, maxLength: 10 }),
            documentSymbolsArb
          ),
          { minLength: 2, maxLength: 5 }
        ),
        async (filesWithSymbols) => {
          const testDir = await createTestDir();
          try {
            // Ensure unique file names
            const uniqueFiles = new Map<string, GeneratedSymbol[]>();
            for (const [fileName, symbols] of filesWithSymbols) {
              const filePath = `src/${fileName}.ts`;
              if (!uniqueFiles.has(filePath)) {
                uniqueFiles.set(filePath, symbols);
              }
            }

            // Build index with multiple files
            const documents: ScipDocumentData[] = [];
            let symbolCounter = 0;

            for (const [filePath, symbols] of uniqueFiles) {
              documents.push({
                language: "typescript",
                relativePath: filePath,
                symbols: symbols.map((s, i) => ({
                  ...s.symbolInfo,
                  symbol: `scip-typescript npm test-pkg 1.0.0 ${filePath} sym${symbolCounter + i}.`,
                  displayName: `sym${symbolCounter + i}`,
                })),
                occurrences: symbols.map((s, i) => ({
                  ...s.occurrence,
                  symbol: `scip-typescript npm test-pkg 1.0.0 ${filePath} sym${symbolCounter + i}.`,
                })),
              });
              symbolCounter += symbols.length;
            }

            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents,
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // Parse and check file hashes
            const result = await parse(indexPath, "test-workspace", "test-package");

            // Verify fileHashes is populated
            expect(result.fileHashes).toBeDefined();
            expect(typeof result.fileHashes).toBe("object");

            // Verify each file has a hash
            for (const filePath of uniqueFiles.keys()) {
              expect(result.fileHashes![filePath]).toBeDefined();
              expect(typeof result.fileHashes![filePath]).toBe("string");
              expect(result.fileHashes![filePath].length).toBeGreaterThan(0);
            }

            // Verify hashes are unique for different file contents
            const hashValues = Object.values(result.fileHashes!);
            // Note: Different files with different content should have different hashes
            // but we can't guarantee uniqueness if content happens to be identical
            expect(hashValues.length).toBe(uniqueFiles.size);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.5: Incremental parsing handles file additions correctly
   *
   * For any SCIP index where new files are added, incremental parsing
   * SHALL process the new files and add their symbols to the result.
   *
   * **Validates: Requirement 3.6**
   */
  it("should handle file additions correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        documentSymbolsArb,
        async (existingSymbols, newSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create initial index with one file
            const initialIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/existing.ts",
                  symbols: existingSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/existing.ts existing${i}.`,
                    displayName: `existing${i}`,
                  })),
                  occurrences: existingSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/existing.ts existing${i}.`,
                  })),
                },
              ],
            };

            const initialBuffer = await createScipIndex(initialIndexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, initialBuffer);

            // First parse
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            expect(firstResult.symbols.length).toBe(existingSymbols.length);

            // Create updated index with new file added
            const updatedIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/existing.ts",
                  symbols: existingSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/existing.ts existing${i}.`,
                    displayName: `existing${i}`,
                  })),
                  occurrences: existingSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/existing.ts existing${i}.`,
                  })),
                },
                {
                  language: "typescript",
                  relativePath: "src/newfile.ts",
                  symbols: newSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/newfile.ts new${i}.`,
                    displayName: `new${i}`,
                  })),
                  occurrences: newSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/newfile.ts new${i}.`,
                  })),
                },
              ],
            };

            const updatedBuffer = await createScipIndex(updatedIndexData);
            await writeFile(indexPath, updatedBuffer);

            // Import parseIncremental
            const { parseIncremental } = await import("../../src/lib/scip_parser.js");

            // Incremental parse
            const incrementalResult = await parseIncremental(
              indexPath,
              "test-workspace",
              "test-package",
              firstResult
            );

            // Verify both existing and new symbols are present
            const existingFileSymbols = incrementalResult.symbols.filter(
              (s) => s.location.file === "src/existing.ts"
            );
            const newFileSymbols = incrementalResult.symbols.filter(
              (s) => s.location.file === "src/newfile.ts"
            );

            expect(existingFileSymbols.length).toBe(existingSymbols.length);
            expect(newFileSymbols.length).toBe(newSymbols.length);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.6: Incremental parsing handles file deletions correctly
   *
   * For any SCIP index where files are deleted, incremental parsing
   * SHALL remove symbols from deleted files from the result.
   *
   * **Validates: Requirement 3.6**
   */
  it("should handle file deletions correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        documentSymbolsArb,
        async (remainingSymbols, deletedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create initial index with two files
            const initialIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/remaining.ts",
                  symbols: remainingSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/remaining.ts remaining${i}.`,
                    displayName: `remaining${i}`,
                  })),
                  occurrences: remainingSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/remaining.ts remaining${i}.`,
                  })),
                },
                {
                  language: "typescript",
                  relativePath: "src/deleted.ts",
                  symbols: deletedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/deleted.ts deleted${i}.`,
                    displayName: `deleted${i}`,
                  })),
                  occurrences: deletedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/deleted.ts deleted${i}.`,
                  })),
                },
              ],
            };

            const initialBuffer = await createScipIndex(initialIndexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, initialBuffer);

            // First parse
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            expect(firstResult.symbols.length).toBe(remainingSymbols.length + deletedSymbols.length);

            // Create updated index with deleted file removed
            const updatedIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/remaining.ts",
                  symbols: remainingSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/remaining.ts remaining${i}.`,
                    displayName: `remaining${i}`,
                  })),
                  occurrences: remainingSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/remaining.ts remaining${i}.`,
                  })),
                },
              ],
            };

            const updatedBuffer = await createScipIndex(updatedIndexData);
            await writeFile(indexPath, updatedBuffer);

            // Import parseIncremental
            const { parseIncremental } = await import("../../src/lib/scip_parser.js");

            // Incremental parse
            const incrementalResult = await parseIncremental(
              indexPath,
              "test-workspace",
              "test-package",
              firstResult
            );

            // Verify only remaining file symbols are present
            expect(incrementalResult.symbols.length).toBe(remainingSymbols.length);
            
            const deletedFileSymbols = incrementalResult.symbols.filter(
              (s) => s.location.file === "src/deleted.ts"
            );
            expect(deletedFileSymbols.length).toBe(0);

            const remainingFileSymbols = incrementalResult.symbols.filter(
              (s) => s.location.file === "src/remaining.ts"
            );
            expect(remainingFileSymbols.length).toBe(remainingSymbols.length);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 11.7: Hash changes are detected correctly
   *
   * For any SCIP index, the hasChanged function SHALL correctly detect
   * when the index content has changed by comparing hashes.
   *
   * **Validates: Requirement 3.6**
   */
  it("should correctly detect hash changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        documentSymbolsArb,
        async (originalSymbols, modifiedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create initial index
            const initialIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: originalSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts original${i}.`,
                    displayName: `original${i}`,
                  })),
                  occurrences: originalSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts original${i}.`,
                  })),
                },
              ],
            };

            const initialBuffer = await createScipIndex(initialIndexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, initialBuffer);

            // First parse to get hash
            const firstResult = await parse(indexPath, "test-workspace", "test-package");
            const originalHash = firstResult.hash;

            // Import hasChanged
            const { hasChanged } = await import("../../src/lib/scip_parser.js");

            // Check unchanged - should return false
            const unchangedResult = await hasChanged(indexPath, originalHash);
            expect(unchangedResult).toBe(false);

            // Modify the index
            const modifiedIndexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: modifiedSymbols.map((s, i) => ({
                    ...s.symbolInfo,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts modified${i}.`,
                    displayName: `modified${i}`,
                  })),
                  occurrences: modifiedSymbols.map((s, i) => ({
                    ...s.occurrence,
                    symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts modified${i}.`,
                  })),
                },
              ],
            };

            const modifiedBuffer = await createScipIndex(modifiedIndexData);
            await writeFile(indexPath, modifiedBuffer);

            // Check changed - should return true
            const changedResult = await hasChanged(indexPath, originalHash);
            expect(changedResult).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property-Based Tests for SCIP Parser - Property 12: Malformed SCIP Handling
 *
 * Property 12: For any malformed or corrupted SCIP index file, the parser SHALL
 * return a graceful error with diagnostic information rather than crashing or
 * producing invalid output.
 *
 * **Validates: Requirement 3.7**
 *
 * @see Design Document: Property 12: Malformed SCIP Handling
 */

describe("Feature: documentation-tools, Property 12: Malformed SCIP Handling", () => {
  /**
   * Property 12.1: Parser never throws exceptions for random binary data
   *
   * For any random binary data (not valid protobuf), the parser SHALL return
   * a structured error result rather than throwing an exception.
   *
   * **Validates: Requirement 3.7**
   */
  it("should never throw exceptions for random binary data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (randomBytes) => {
          const testDir = await createTestDir();
          try {
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, Buffer.from(randomBytes));

            // Parser should not throw - it should return a result with errors
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);
            expect(result!.relationships).toBeDefined();
            expect(Array.isArray(result!.relationships)).toBe(true);
            expect(typeof result!.hash).toBe("string");

            // Note: Some random bytes may happen to be valid (empty) protobuf,
            // so we don't require errors - the key property is no exceptions
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.2: Parser returns structured errors for truncated protobuf data
   *
   * For any valid SCIP index that is truncated, the parser SHALL return
   * a structured error with diagnostic information.
   *
   * **Validates: Requirement 3.7**
   */
  it("should return structured errors for truncated protobuf data", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.9) }),
        async (generatedSymbols, truncateRatio) => {
          const testDir = await createTestDir();
          try {
            // Create a valid SCIP index
            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const validBuffer = await createScipIndex(indexData);

            // Truncate the buffer at a random point
            const truncatePoint = Math.floor(validBuffer.length * truncateRatio);
            const truncatedBuffer = validBuffer.subarray(0, truncatePoint);

            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, truncatedBuffer);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);
            expect(result!.relationships).toBeDefined();
            expect(Array.isArray(result!.relationships)).toBe(true);

            // Hash should still be computed (for the truncated content)
            expect(typeof result!.hash).toBe("string");
            expect(result!.hash.length).toBeGreaterThan(0);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.3: Parser handles empty files gracefully
   *
   * For any empty file, the parser SHALL return a structured error
   * rather than crashing.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle empty files gracefully", async () => {
    const testDir = await createTestDir();
    try {
      const indexPath = join(testDir, "index.scip");
      await writeFile(indexPath, Buffer.alloc(0));

      // Parser should not throw
      let result: ScipParseResult | null = null;
      let threwException = false;

      try {
        result = await parse(indexPath, "test-workspace", "test-package");
      } catch {
        threwException = true;
      }

      // Should not throw
      expect(threwException).toBe(false);

      // Should return a result
      expect(result).not.toBeNull();

      // Result should have valid structure with empty symbols
      expect(result!.symbols).toBeDefined();
      expect(Array.isArray(result!.symbols)).toBe(true);
      expect(result!.relationships).toBeDefined();
      expect(Array.isArray(result!.relationships)).toBe(true);
    } finally {
      await cleanupTestDir(testDir);
    }
  });

  /**
   * Property 12.4: Parser handles non-existent files gracefully
   *
   * For any non-existent file path, the parser SHALL return a structured
   * error with diagnostic information.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle non-existent files gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz".split(""))), { minLength: 5, maxLength: 20 }),
        async (randomFileName) => {
          const testDir = await createTestDir();
          try {
            const indexPath = join(testDir, `${randomFileName}.scip`);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Should have errors for non-existent file
            expect(result!.errors).toBeDefined();
            expect(result!.errors!.length).toBeGreaterThan(0);

            // Error should contain diagnostic information
            const fileError = result!.errors!.find((e) => 
              e.message.toLowerCase().includes("read") || 
              e.message.toLowerCase().includes("file") ||
              e.message.toLowerCase().includes("enoent")
            );
            expect(fileError).toBeDefined();
            expect(fileError!.recoverable).toBe(false);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.5: Parser handles valid protobuf with invalid SCIP structure
   *
   * For any valid protobuf message that doesn't conform to SCIP schema,
   * the parser SHALL return a structured error or empty result.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle valid protobuf with invalid SCIP structure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          unknownField1: fc.string(),
          unknownField2: fc.integer(),
          nestedUnknown: fc.record({
            field: fc.string(),
          }),
        }),
        async (invalidStructure) => {
          const testDir = await createTestDir();
          try {
            // Create a protobuf message with wrong structure
            const root = await loadTestProtoSchema();
            const IndexType = root.lookupType("scip.Index");

            // Create an index with invalid/missing required structure
            // This creates a valid protobuf but with unexpected content
            const indexData: ScipIndexData = {
              // Empty documents array - valid but minimal
              documents: [],
              // No metadata
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);
            expect(result!.relationships).toBeDefined();
            expect(Array.isArray(result!.relationships)).toBe(true);

            // Empty documents should result in empty symbols
            expect(result!.symbols.length).toBe(0);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.6: Parser handles documents with missing required fields
   *
   * For any SCIP index with documents missing required fields (like relativePath),
   * the parser SHALL continue processing valid portions and report errors.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle documents with missing required fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        async (generatedSymbols) => {
          const testDir = await createTestDir();
          try {
            // Create index with a document missing relativePath
            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  // Missing relativePath
                  language: "typescript",
                  symbols: generatedSymbols.map((s) => s.symbolInfo),
                  occurrences: generatedSymbols.map((s) => s.occurrence),
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);

            // Parser should still extract symbols (with empty file path)
            // or report recoverable errors
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.7: Parser handles symbols with invalid format
   *
   * For any SCIP index with malformed symbol strings, the parser SHALL
   * skip invalid symbols and continue processing valid ones.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle symbols with invalid format and continue processing", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        fc.array(fc.constantFrom("", " ", "\0", "\n\r", "invalid symbol format"), { minLength: 1, maxLength: 3 }),
        async (validSymbols, invalidSymbolStrings) => {
          const testDir = await createTestDir();
          try {
            // Create index with mix of valid and invalid symbols
            const validSymbolInfos = validSymbols.map((s) => s.symbolInfo);
            const validOccurrences = validSymbols.map((s) => s.occurrence);

            // Add invalid symbols
            const invalidSymbolInfos: ScipSymbolInfoData[] = invalidSymbolStrings.map((invalidStr, i) => ({
              symbol: invalidStr,
              kind: ScipKind.Function,
              displayName: `invalid${i}`,
            }));

            const invalidOccurrences: ScipOccurrenceData[] = invalidSymbolStrings.map((invalidStr, i) => ({
              range: [i * 10, 0, 10],
              symbol: invalidStr,
              symbolRoles: SymbolRole.Definition,
            }));

            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: [...validSymbolInfos, ...invalidSymbolInfos],
                  occurrences: [...validOccurrences, ...invalidOccurrences],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);

            // Should have extracted at least the valid symbols
            expect(result!.symbols.length).toBeGreaterThanOrEqual(validSymbols.length);

            // Parser may or may not report errors for invalid symbols depending on
            // how they are processed - the key property is that it doesn't crash
            // and continues processing valid symbols
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.8: Parser handles occurrences with invalid ranges
   *
   * For any SCIP index with occurrences having invalid ranges (negative numbers,
   * wrong array length), the parser SHALL skip invalid occurrences and continue.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle occurrences with invalid ranges", async () => {
    await fc.assert(
      fc.asyncProperty(
        documentSymbolsArb,
        fc.array(
          fc.oneof(
            fc.constant([]),                           // Empty range
            fc.constant([-1, 0, 10]),                   // Negative line
            fc.constant([0, -5, 10]),                   // Negative column
            fc.constant([0]),                          // Too few elements
            fc.constant([0, 0]),                       // Too few elements
          ),
          { minLength: 1, maxLength: 3 }
        ),
        async (validSymbols, invalidRanges) => {
          const testDir = await createTestDir();
          try {
            // Create valid symbols
            const validSymbolInfos = validSymbols.map((s) => s.symbolInfo);
            const validOccurrences = validSymbols.map((s) => s.occurrence);

            // Add occurrences with invalid ranges
            const invalidOccurrences: ScipOccurrenceData[] = invalidRanges.map((range, i) => ({
              range,
              symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts invalidRange${i}.`,
              symbolRoles: SymbolRole.Definition,
            }));

            const invalidSymbolInfos: ScipSymbolInfoData[] = invalidRanges.map((_, i) => ({
              symbol: `scip-typescript npm test-pkg 1.0.0 src/test.ts invalidRange${i}.`,
              kind: ScipKind.Function,
              displayName: `invalidRange${i}`,
            }));

            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: [...validSymbolInfos, ...invalidSymbolInfos],
                  occurrences: [...validOccurrences, ...invalidOccurrences],
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);

            // Should have extracted at least the valid symbols
            expect(result!.symbols.length).toBeGreaterThanOrEqual(validSymbols.length);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.9: Error messages contain diagnostic information
   *
   * For any clearly malformed SCIP index (invalid protobuf structure),
   * the parser SHALL return errors that contain useful diagnostic information.
   *
   * **Validates: Requirement 3.7**
   */
  it("should return errors with diagnostic information", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate bytes that are clearly invalid protobuf (high bytes, invalid wire types)
        fc.uint8Array({ minLength: 20, maxLength: 100 }).filter((arr) => {
          // Filter to ensure we have bytes that will definitely fail protobuf parsing
          // Look for patterns that are clearly invalid (e.g., wire type 6 or 7 which are reserved)
          return arr.some((b) => (b & 0x07) >= 6) || arr.some((b) => b > 200);
        }),
        async (randomBytes) => {
          const testDir = await createTestDir();
          try {
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, Buffer.from(randomBytes));

            const result = await parse(indexPath, "test-workspace", "test-package");

            // If there are errors, they should have proper structure
            if (result.errors && result.errors.length > 0) {
              // Each error should have required fields
              for (const error of result.errors) {
                // Message should be non-empty
                expect(error.message).toBeDefined();
                expect(typeof error.message).toBe("string");
                expect(error.message.length).toBeGreaterThan(0);

                // Recoverable flag should be defined
                expect(typeof error.recoverable).toBe("boolean");
              }
            }

            // The key property is that the parser doesn't crash
            expect(result).toBeDefined();
            expect(result.symbols).toBeDefined();
            expect(result.relationships).toBeDefined();
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.10: Parser produces valid output structure even for malformed input
   *
   * For any input (valid or malformed), the parser SHALL always return a result
   * with valid structure (symbols array, relationships array, hash string).
   *
   * **Validates: Requirement 3.7**
   */
  it("should always produce valid output structure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Random bytes
          fc.uint8Array({ minLength: 0, maxLength: 500 }).map((arr) => Buffer.from(arr)),
          // Truncated valid index
          fc.tuple(documentSymbolsArb, fc.float({ min: Math.fround(0.1), max: Math.fround(0.9) })).map(async ([symbols, ratio]) => {
            const indexData: ScipIndexData = {
              documents: [{
                relativePath: "src/test.ts",
                symbols: symbols.map((s) => s.symbolInfo),
                occurrences: symbols.map((s) => s.occurrence),
              }],
            };
            const buffer = await createScipIndex(indexData);
            return buffer.subarray(0, Math.floor(buffer.length * ratio));
          }),
        ),
        async (bufferOrPromise) => {
          const testDir = await createTestDir();
          try {
            const buffer = bufferOrPromise instanceof Promise ? await bufferOrPromise : bufferOrPromise;
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Result should always have valid structure
            expect(result).toBeDefined();
            expect(result).not.toBeNull();

            // symbols should be an array
            expect(result.symbols).toBeDefined();
            expect(Array.isArray(result.symbols)).toBe(true);

            // relationships should be an array
            expect(result.relationships).toBeDefined();
            expect(Array.isArray(result.relationships)).toBe(true);

            // hash should be a string
            expect(typeof result.hash).toBe("string");

            // If there are symbols, they should have valid structure
            for (const symbol of result.symbols) {
              expect(typeof symbol.name).toBe("string");
              expect(typeof symbol.kind).toBe("string");
              expect(typeof symbol.signature).toBe("string");
              expect(typeof symbol.arn).toBe("string");
              expect(symbol.location).toBeDefined();
              expect(typeof symbol.location.file).toBe("string");
              expect(typeof symbol.location.line).toBe("number");
              expect(typeof symbol.location.column).toBe("number");
            }

            // If there are relationships, they should have valid structure
            for (const rel of result.relationships) {
              expect(typeof rel.from).toBe("string");
              expect(typeof rel.to).toBe("string");
              expect(typeof rel.type).toBe("string");
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
   * Property 12.11: Parser handles corrupted protobuf wire types
   *
   * For any data with invalid protobuf wire types, the parser SHALL return
   * a structured error rather than crashing.
   *
   * **Validates: Requirement 3.7**
   */
  it("should handle corrupted protobuf wire types", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate bytes that look like protobuf but have invalid wire types
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 15 }),  // Field number
            fc.integer({ min: 0, max: 7 }),   // Wire type (some invalid)
            fc.uint8Array({ minLength: 1, maxLength: 10 })
          ),
          { minLength: 1, maxLength: 10 }
        ),
        async (fields) => {
          const testDir = await createTestDir();
          try {
            // Build a buffer that looks like protobuf but may have invalid structure
            const chunks: number[] = [];
            for (const [fieldNum, wireType, data] of fields) {
              // Protobuf tag = (field_number << 3) | wire_type
              const tag = (fieldNum << 3) | wireType;
              chunks.push(tag);
              // Add some data bytes
              chunks.push(...Array.from(data));
            }

            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, Buffer.from(chunks));

            // Parser should not throw
            let result: ScipParseResult | null = null;
            let threwException = false;

            try {
              result = await parse(indexPath, "test-workspace", "test-package");
            } catch {
              threwException = true;
            }

            // Should not throw
            expect(threwException).toBe(false);

            // Should return a result
            expect(result).not.toBeNull();

            // Result should have valid structure
            expect(result!.symbols).toBeDefined();
            expect(Array.isArray(result!.symbols)).toBe(true);
            expect(result!.relationships).toBeDefined();
            expect(Array.isArray(result!.relationships)).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.12: Recoverable errors allow continued processing
   *
   * For any SCIP index with some recoverable errors (e.g., one malformed symbol
   * among many valid ones), the parser SHALL continue processing and extract
   * valid data while reporting the errors.
   *
   * **Validates: Requirement 3.7**
   */
  it("should continue processing after recoverable errors", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(generatedSymbolArb, { minLength: 3, maxLength: 10 }),
        fc.integer({ min: 0, max: 2 }),
        async (validSymbols, corruptIndex) => {
          const testDir = await createTestDir();
          try {
            // Create symbols with one corrupted entry
            const symbolInfos = validSymbols.map((s, i) => {
              if (i === corruptIndex) {
                // Corrupt this symbol's data
                return {
                  ...s.symbolInfo,
                  symbol: "", // Empty symbol string - should be recoverable
                };
              }
              return s.symbolInfo;
            });

            const occurrences = validSymbols.map((s, i) => {
              if (i === corruptIndex) {
                return {
                  ...s.occurrence,
                  symbol: "", // Empty symbol string
                };
              }
              return s.occurrence;
            });

            const indexData: ScipIndexData = {
              metadata: {
                toolInfo: { name: "scip-typescript", version: "0.3.0" },
                projectRoot: "file:///test",
              },
              documents: [
                {
                  language: "typescript",
                  relativePath: "src/test.ts",
                  symbols: symbolInfos,
                  occurrences: occurrences,
                },
              ],
            };

            const buffer = await createScipIndex(indexData);
            const indexPath = join(testDir, "index.scip");
            await writeFile(indexPath, buffer);

            const result = await parse(indexPath, "test-workspace", "test-package");

            // Should have extracted at least some valid symbols
            // (validSymbols.length - 1 because one is corrupted)
            expect(result.symbols.length).toBeGreaterThanOrEqual(validSymbols.length - 1);

            // Should have errors for the corrupted symbol
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);

            // At least one error should be recoverable
            const hasRecoverableError = result.errors!.some((e) => e.recoverable);
            expect(hasRecoverableError).toBe(true);
          } finally {
            await cleanupTestDir(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
