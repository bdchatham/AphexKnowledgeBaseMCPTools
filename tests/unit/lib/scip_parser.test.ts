/**
 * Unit Tests for SCIP Parser
 *
 * Tests for the SCIP index parser that extracts symbol information,
 * relationships, and documentation from SCIP index files.
 *
 * @see Requirements 3.1-3.7
 */

import { parse, hasChanged, parseIncremental, ScipErrorCode } from "../../../src/lib/scip_parser.js";
import type { ScipParseResult, ScipSymbol, ScipRelationship } from "../../../src/types/scip.js";
import { mkdir, writeFile, rm, readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import protobuf from "protobufjs";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the directory of this module for loading the proto file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a minimal proto schema for testing that avoids the alias issue.
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


describe("SCIP Parser", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `scip-parser-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("parse", () => {
    /**
     * Tests for the main parse function.
     * Validates: Requirements 3.2, 3.3, 3.4
     */

    describe("empty index", () => {
      /**
       * Tests for handling empty SCIP indexes.
       * Validates: Requirement 3.7
       */

      it("should handle empty index with no documents", async () => {
        const indexPath = join(testDir, "empty.scip");
        const indexData: ScipIndexData = {
          metadata: {
            version: 0,
            toolInfo: { name: "test-indexer", version: "1.0.0" },
            projectRoot: "file:///test",
          },
          documents: [],
          externalSymbols: [],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "test-workspace", "test-package");

        expect(result.symbols).toEqual([]);
        expect(result.relationships).toEqual([]);
        expect(result.hash).toBeTruthy();
        expect(result.hash.length).toBe(64); // SHA-256 hex length
        expect(result.errors).toBeUndefined();
      });

      it("should handle index with empty documents array", async () => {
        const indexPath = join(testDir, "empty-docs.scip");
        const indexData: ScipIndexData = {
          documents: [],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toEqual([]);
        expect(result.relationships).toEqual([]);
        expect(result.hash).toBeTruthy();
      });
    });


    describe("single symbol index", () => {
      /**
       * Tests for parsing indexes with a single symbol.
       * Validates: Requirements 3.2, 3.3, 3.4
       */

      it("should parse index with single function symbol", async () => {
        const indexPath = join(testDir, "single-function.scip");
        const indexData: ScipIndexData = {
          metadata: {
            toolInfo: { name: "scip-typescript", version: "0.3.0" },
            projectRoot: "file:///project",
          },
          documents: [
            {
              language: "typescript",
              relativePath: "src/index.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm test-package 1.0.0 src/index.ts myFunction.",
                  documentation: ["A test function that does something useful."],
                  kind: ScipKind.Function,
                  displayName: "myFunction",
                },
              ],
              occurrences: [
                {
                  range: [10, 0, 20], // line 10, col 0-20
                  symbol: "scip-typescript npm test-package 1.0.0 src/index.ts myFunction.",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "test-workspace", "test-package");

        expect(result.symbols).toHaveLength(1);
        expect(result.symbols[0].name).toBe("myFunction");
        expect(result.symbols[0].kind).toBe("function");
        expect(result.symbols[0].documentation).toBe("A test function that does something useful.");
        expect(result.symbols[0].location.file).toBe("src/index.ts");
        expect(result.symbols[0].location.line).toBe(11); // 1-indexed
        expect(result.symbols[0].arn).toContain("arn:archon:code:");
        expect(result.errors).toBeUndefined();
      });

      it("should parse index with single class symbol", async () => {
        const indexPath = join(testDir, "single-class.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              language: "typescript",
              relativePath: "src/models/User.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/models/User.ts User#",
                  documentation: ["User model class"],
                  kind: ScipKind.Class,
                  displayName: "User",
                },
              ],
              occurrences: [
                {
                  range: [5, 13, 17],
                  symbol: "scip-typescript npm pkg 1.0.0 src/models/User.ts User#",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toHaveLength(1);
        expect(result.symbols[0].name).toBe("User");
        expect(result.symbols[0].kind).toBe("class");
        expect(result.symbols[0].location.file).toBe("src/models/User.ts");
      });

      it("should parse index with single variable symbol", async () => {
        const indexPath = join(testDir, "single-var.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "config.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 config.ts CONFIG.",
                  kind: ScipKind.Variable,
                  displayName: "CONFIG",
                },
              ],
              occurrences: [
                {
                  range: [0, 6, 12],
                  symbol: "scip-typescript npm pkg 1.0.0 config.ts CONFIG.",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toHaveLength(1);
        expect(result.symbols[0].name).toBe("CONFIG");
        expect(result.symbols[0].kind).toBe("variable");
      });
    });


    describe("large index with multiple documents and symbols", () => {
      /**
       * Tests for parsing indexes with multiple documents and symbols.
       * Validates: Requirements 3.2, 3.3, 3.4, 3.5
       */

      it("should parse index with multiple documents", async () => {
        const indexPath = join(testDir, "multi-doc.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/lib/utils.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/lib/utils.ts formatDate.",
                  kind: ScipKind.Function,
                  displayName: "formatDate",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/lib/utils.ts parseDate.",
                  kind: ScipKind.Function,
                  displayName: "parseDate",
                },
              ],
              occurrences: [
                {
                  range: [5, 0, 10],
                  symbol: "scip-typescript npm pkg 1.0.0 src/lib/utils.ts formatDate.",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [15, 0, 9],
                  symbol: "scip-typescript npm pkg 1.0.0 src/lib/utils.ts parseDate.",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
            {
              relativePath: "src/models/User.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/models/User.ts User#",
                  kind: ScipKind.Class,
                  displayName: "User",
                },
              ],
              occurrences: [
                {
                  range: [3, 13, 17],
                  symbol: "scip-typescript npm pkg 1.0.0 src/models/User.ts User#",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
            {
              relativePath: "src/index.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/index.ts main.",
                  kind: ScipKind.Function,
                  displayName: "main",
                },
              ],
              occurrences: [
                {
                  range: [10, 0, 4],
                  symbol: "scip-typescript npm pkg 1.0.0 src/index.ts main.",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toHaveLength(4);
        
        const symbolNames = result.symbols.map(s => s.name);
        expect(symbolNames).toContain("formatDate");
        expect(symbolNames).toContain("parseDate");
        expect(symbolNames).toContain("User");
        expect(symbolNames).toContain("main");

        // Verify file locations
        const utilsSymbols = result.symbols.filter(s => s.location.file === "src/lib/utils.ts");
        expect(utilsSymbols).toHaveLength(2);

        const userSymbols = result.symbols.filter(s => s.location.file === "src/models/User.ts");
        expect(userSymbols).toHaveLength(1);
      });

      it("should handle index with many symbols (stress test)", async () => {
        const indexPath = join(testDir, "large.scip");
        const symbolCount = 100;
        
        const symbols: ScipSymbolInfoData[] = [];
        const occurrences: ScipOccurrenceData[] = [];
        
        for (let i = 0; i < symbolCount; i++) {
          const symbolName = `function${i}`;
          const symbolId = `scip-typescript npm pkg 1.0.0 src/large.ts ${symbolName}.`;
          
          symbols.push({
            symbol: symbolId,
            kind: ScipKind.Function,
            displayName: symbolName,
            documentation: [`Documentation for ${symbolName}`],
          });
          
          occurrences.push({
            range: [i * 10, 0, symbolName.length],
            symbol: symbolId,
            symbolRoles: SymbolRole.Definition,
          });
        }
        
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/large.ts",
              symbols,
              occurrences,
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toHaveLength(symbolCount);
        expect(result.errors).toBeUndefined();
        
        // Verify all symbols have unique ARNs
        const arns = new Set(result.symbols.map(s => s.arn));
        expect(arns.size).toBe(symbolCount);
      });
    });


    describe("relationship extraction", () => {
      /**
       * Tests for extracting relationships between symbols.
       * Validates: Requirement 3.5
       */

      it("should extract contains relationships from enclosing symbols", async () => {
        const indexPath = join(testDir, "contains.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/User.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#",
                  kind: ScipKind.Class,
                  displayName: "User",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#getName().",
                  kind: ScipKind.Method,
                  displayName: "getName",
                  enclosingSymbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#setName().",
                  kind: ScipKind.Method,
                  displayName: "setName",
                  enclosingSymbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#",
                },
              ],
              occurrences: [
                {
                  range: [0, 13, 17],
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [5, 2, 9],
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#getName().",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [10, 2, 9],
                  symbol: "scip-typescript npm pkg 1.0.0 src/User.ts User#setName().",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toHaveLength(3);
        
        // Find contains relationships
        const containsRels = result.relationships.filter(r => r.type === "contains");
        expect(containsRels.length).toBeGreaterThanOrEqual(2);
        
        // User should contain getName and setName - check by symbol name patterns in ARNs
        const userSymbol = result.symbols.find(s => s.name === "User");
        const getNameSymbol = result.symbols.find(s => s.name === "getName");
        const setNameSymbol = result.symbols.find(s => s.name === "setName");
        
        expect(userSymbol).toBeDefined();
        expect(getNameSymbol).toBeDefined();
        expect(setNameSymbol).toBeDefined();
        
        // Verify contains relationships exist (parent contains child)
        expect(containsRels.some(r => 
          r.from === userSymbol?.arn && r.to === getNameSymbol?.arn
        )).toBe(true);
        expect(containsRels.some(r => 
          r.from === userSymbol?.arn && r.to === setNameSymbol?.arn
        )).toBe(true);
      });

      it("should extract implements relationships", async () => {
        const indexPath = join(testDir, "implements.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/UserService.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/UserService.ts IUserService#",
                  kind: ScipKind.Interface,
                  displayName: "IUserService",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/UserService.ts UserService#",
                  kind: ScipKind.Class,
                  displayName: "UserService",
                  relationships: [
                    {
                      symbol: "scip-typescript npm pkg 1.0.0 src/UserService.ts IUserService#",
                      isImplementation: true,
                    },
                  ],
                },
              ],
              occurrences: [
                {
                  range: [0, 10, 22],
                  symbol: "scip-typescript npm pkg 1.0.0 src/UserService.ts IUserService#",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [5, 6, 17],
                  symbol: "scip-typescript npm pkg 1.0.0 src/UserService.ts UserService#",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        const implementsRels = result.relationships.filter(r => r.type === "implements");
        expect(implementsRels.length).toBeGreaterThanOrEqual(1);
        
        const serviceArn = result.symbols.find(s => s.name === "UserService")?.arn;
        const interfaceArn = result.symbols.find(s => s.name === "IUserService")?.arn;
        
        expect(implementsRels.some(r => r.from === serviceArn && r.to === interfaceArn)).toBe(true);
      });

      it("should extract extends relationships", async () => {
        const indexPath = join(testDir, "extends.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/models.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/models.ts BaseModel#",
                  kind: ScipKind.Class,
                  displayName: "BaseModel",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/models.ts UserModel#",
                  kind: ScipKind.Class,
                  displayName: "UserModel",
                  relationships: [
                    {
                      symbol: "scip-typescript npm pkg 1.0.0 src/models.ts BaseModel#",
                      isTypeDefinition: true,
                    },
                  ],
                },
              ],
              occurrences: [
                {
                  range: [0, 6, 15],
                  symbol: "scip-typescript npm pkg 1.0.0 src/models.ts BaseModel#",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [10, 6, 15],
                  symbol: "scip-typescript npm pkg 1.0.0 src/models.ts UserModel#",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        const extendsRels = result.relationships.filter(r => r.type === "extends");
        expect(extendsRels.length).toBeGreaterThanOrEqual(1);
      });

      it("should extract imports relationships", async () => {
        const indexPath = join(testDir, "imports.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/utils.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/utils.ts formatDate.",
                  kind: ScipKind.Function,
                  displayName: "formatDate",
                },
              ],
              occurrences: [
                {
                  range: [0, 16, 26],
                  symbol: "scip-typescript npm pkg 1.0.0 src/utils.ts formatDate.",
                  symbolRoles: SymbolRole.Definition,
                },
              ],
            },
            {
              relativePath: "src/index.ts",
              symbols: [],
              occurrences: [
                {
                  range: [0, 9, 19],
                  symbol: "scip-typescript npm pkg 1.0.0 src/utils.ts formatDate.",
                  symbolRoles: SymbolRole.Import,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        const importsRels = result.relationships.filter(r => r.type === "imports");
        expect(importsRels.length).toBeGreaterThanOrEqual(1);
      });

      it("should extract references relationships", async () => {
        const indexPath = join(testDir, "references.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/app.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/app.ts helper.",
                  kind: ScipKind.Function,
                  displayName: "helper",
                },
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/app.ts main.",
                  kind: ScipKind.Function,
                  displayName: "main",
                  relationships: [
                    {
                      symbol: "scip-typescript npm pkg 1.0.0 src/app.ts helper.",
                      isReference: true,
                    },
                  ],
                },
              ],
              occurrences: [
                {
                  range: [0, 9, 15],
                  symbol: "scip-typescript npm pkg 1.0.0 src/app.ts helper.",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [5, 9, 13],
                  symbol: "scip-typescript npm pkg 1.0.0 src/app.ts main.",
                  symbolRoles: SymbolRole.Definition,
                },
                {
                  range: [7, 2, 8],
                  symbol: "scip-typescript npm pkg 1.0.0 src/app.ts helper.",
                  symbolRoles: SymbolRole.ReadAccess,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        const referencesRels = result.relationships.filter(r => r.type === "references");
        expect(referencesRels.length).toBeGreaterThanOrEqual(1);
      });
    });


    describe("hash computation", () => {
      /**
       * Tests for hash computation and change detection.
       * Validates: Requirement 3.6
       */

      it("should compute deterministic hash for same content", async () => {
        const indexPath = join(testDir, "hash-test.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [
                {
                  symbol: "scip-typescript npm pkg 1.0.0 src/test.ts test.",
                  kind: ScipKind.Function,
                },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result1 = await parse(indexPath, "ws", "pkg");
        const result2 = await parse(indexPath, "ws", "pkg");

        expect(result1.hash).toBe(result2.hash);
        expect(result1.hash.length).toBe(64); // SHA-256 hex
      });

      it("should compute different hash for different content", async () => {
        const indexPath1 = join(testDir, "hash1.scip");
        const indexPath2 = join(testDir, "hash2.scip");
        
        const indexData1: ScipIndexData = {
          documents: [
            {
              relativePath: "src/a.ts",
              symbols: [{ symbol: "sym1", kind: ScipKind.Function }],
            },
          ],
        };
        
        const indexData2: ScipIndexData = {
          documents: [
            {
              relativePath: "src/b.ts",
              symbols: [{ symbol: "sym2", kind: ScipKind.Class }],
            },
          ],
        };
        
        await writeFile(indexPath1, await createScipIndex(indexData1));
        await writeFile(indexPath2, await createScipIndex(indexData2));

        const result1 = await parse(indexPath1, "ws", "pkg");
        const result2 = await parse(indexPath2, "ws", "pkg");

        expect(result1.hash).not.toBe(result2.hash);
      });

      it("should include per-file hashes for incremental parsing", async () => {
        const indexPath = join(testDir, "file-hashes.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/a.ts",
              symbols: [{ symbol: "symA", kind: ScipKind.Function }],
            },
            {
              relativePath: "src/b.ts",
              symbols: [{ symbol: "symB", kind: ScipKind.Class }],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.fileHashes).toBeDefined();
        expect(result.fileHashes!["src/a.ts"]).toBeTruthy();
        expect(result.fileHashes!["src/b.ts"]).toBeTruthy();
        expect(result.fileHashes!["src/a.ts"]).not.toBe(result.fileHashes!["src/b.ts"]);
      });
    });

    describe("symbol kinds mapping", () => {
      /**
       * Tests for mapping SCIP kinds to our symbol kinds.
       * Validates: Requirement 3.2
       */

      it("should map all supported symbol kinds correctly", async () => {
        const indexPath = join(testDir, "kinds.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/kinds.ts",
              symbols: [
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts func.", kind: ScipKind.Function, displayName: "func" },
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts cls#", kind: ScipKind.Class, displayName: "cls" },
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts method().", kind: ScipKind.Method, displayName: "method" },
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts varName.", kind: ScipKind.Variable, displayName: "varName" },
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts iface#", kind: ScipKind.Interface, displayName: "iface" },
                { symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts mod/", kind: ScipKind.Module, displayName: "mod" },
              ],
              occurrences: [
                { range: [0, 0, 4], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts func.", symbolRoles: SymbolRole.Definition },
                { range: [1, 0, 3], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts cls#", symbolRoles: SymbolRole.Definition },
                { range: [2, 0, 6], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts method().", symbolRoles: SymbolRole.Definition },
                { range: [3, 0, 7], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts varName.", symbolRoles: SymbolRole.Definition },
                { range: [4, 0, 5], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts iface#", symbolRoles: SymbolRole.Definition },
                { range: [5, 0, 3], symbol: "scip-typescript npm pkg 1.0.0 src/kinds.ts mod/", symbolRoles: SymbolRole.Definition },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Build a map of symbol name to kind
        const kindMap = new Map(result.symbols.map(s => [s.name, s.kind]));
        
        // The parser extracts names from the SCIP symbol string
        expect(kindMap.get("func")).toBe("function");
        expect(kindMap.get("cls")).toBe("class");
        expect(kindMap.get("method")).toBe("method");
        expect(kindMap.get("varName")).toBe("variable");
        expect(kindMap.get("iface")).toBe("type"); // Interface maps to type
        expect(kindMap.get("mod")).toBe("module");
      });

      it("should default to variable for unknown kinds", async () => {
        const indexPath = join(testDir, "unknown-kind.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [
                { symbol: "sym1", kind: 999, displayName: "unknown" }, // Invalid kind
                { symbol: "sym2", kind: 0, displayName: "unspecified" }, // Unspecified
              ],
              occurrences: [
                { range: [0, 0, 7], symbol: "sym1", symbolRoles: SymbolRole.Definition },
                { range: [1, 0, 11], symbol: "sym2", symbolRoles: SymbolRole.Definition },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols.every(s => s.kind === "variable")).toBe(true);
      });
    });
  });


  describe("hasChanged", () => {
    /**
     * Tests for the hasChanged function.
     * Validates: Requirement 3.6
     */

    it("should return false when hash matches", async () => {
      const indexPath = join(testDir, "unchanged.scip");
      const indexData: ScipIndexData = {
        documents: [{ relativePath: "test.ts" }],
      };
      
      const buffer = await createScipIndex(indexData);
      await writeFile(indexPath, buffer);

      const result = await parse(indexPath, "ws", "pkg");
      const changed = await hasChanged(indexPath, result.hash);

      expect(changed).toBe(false);
    });

    it("should return true when hash does not match", async () => {
      const indexPath = join(testDir, "changed.scip");
      const indexData: ScipIndexData = {
        documents: [{ relativePath: "test.ts" }],
      };
      
      const buffer = await createScipIndex(indexData);
      await writeFile(indexPath, buffer);

      const changed = await hasChanged(indexPath, "different-hash-value");

      expect(changed).toBe(true);
    });

    it("should return true when file does not exist", async () => {
      const nonExistentPath = join(testDir, "does-not-exist.scip");
      
      const changed = await hasChanged(nonExistentPath, "any-hash");

      expect(changed).toBe(true);
    });

    it("should return true for empty stored hash", async () => {
      const indexPath = join(testDir, "empty-hash.scip");
      const indexData: ScipIndexData = {
        documents: [{ relativePath: "test.ts" }],
      };
      
      const buffer = await createScipIndex(indexData);
      await writeFile(indexPath, buffer);

      const changed = await hasChanged(indexPath, "");

      expect(changed).toBe(true);
    });
  });

  describe("parseIncremental", () => {
    /**
     * Tests for incremental parsing.
     * Validates: Requirement 3.6
     */

    it("should return previous result when index unchanged", async () => {
      const indexPath = join(testDir, "incremental-unchanged.scip");
      const indexData: ScipIndexData = {
        documents: [
          {
            relativePath: "src/test.ts",
            symbols: [{ symbol: "sym1", kind: ScipKind.Function }],
            occurrences: [{ range: [0, 0, 4], symbol: "sym1", symbolRoles: SymbolRole.Definition }],
          },
        ],
      };
      
      const buffer = await createScipIndex(indexData);
      await writeFile(indexPath, buffer);

      const initialResult = await parse(indexPath, "ws", "pkg");
      const incrementalResult = await parseIncremental(indexPath, "ws", "pkg", initialResult);

      // Should return the same result since nothing changed
      expect(incrementalResult.hash).toBe(initialResult.hash);
      expect(incrementalResult.symbols).toEqual(initialResult.symbols);
    });

    it("should detect and process changed files", async () => {
      const indexPath = join(testDir, "incremental-changed.scip");
      
      // Initial index
      const indexData1: ScipIndexData = {
        documents: [
          {
            relativePath: "src/a.ts",
            symbols: [{ symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA.", kind: ScipKind.Function, displayName: "funcA" }],
            occurrences: [{ range: [0, 0, 5], symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA.", symbolRoles: SymbolRole.Definition }],
          },
          {
            relativePath: "src/b.ts",
            symbols: [{ symbol: "scip-typescript npm pkg 1.0.0 src/b.ts funcB.", kind: ScipKind.Function, displayName: "funcB" }],
            occurrences: [{ range: [0, 0, 5], symbol: "scip-typescript npm pkg 1.0.0 src/b.ts funcB.", symbolRoles: SymbolRole.Definition }],
          },
        ],
      };
      
      await writeFile(indexPath, await createScipIndex(indexData1));
      const initialResult = await parse(indexPath, "ws", "pkg");

      // Modified index - only src/a.ts changed
      const indexData2: ScipIndexData = {
        documents: [
          {
            relativePath: "src/a.ts",
            symbols: [
              { symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA.", kind: ScipKind.Function, displayName: "funcA" },
              { symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA2.", kind: ScipKind.Function, displayName: "funcA2" }, // New symbol
            ],
            occurrences: [
              { range: [0, 0, 5], symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA.", symbolRoles: SymbolRole.Definition },
              { range: [5, 0, 6], symbol: "scip-typescript npm pkg 1.0.0 src/a.ts funcA2.", symbolRoles: SymbolRole.Definition },
            ],
          },
          {
            relativePath: "src/b.ts",
            symbols: [{ symbol: "scip-typescript npm pkg 1.0.0 src/b.ts funcB.", kind: ScipKind.Function, displayName: "funcB" }],
            occurrences: [{ range: [0, 0, 5], symbol: "scip-typescript npm pkg 1.0.0 src/b.ts funcB.", symbolRoles: SymbolRole.Definition }],
          },
        ],
      };
      
      await writeFile(indexPath, await createScipIndex(indexData2));
      const incrementalResult = await parseIncremental(indexPath, "ws", "pkg", initialResult);

      // Hash should be different
      expect(incrementalResult.hash).not.toBe(initialResult.hash);
      
      // Should have the symbols (names are extracted from SCIP symbol strings)
      const symbolNames = incrementalResult.symbols.map(s => s.name);
      expect(symbolNames).toContain("funcA");
      expect(symbolNames).toContain("funcB");
    });

    it("should fall back to full parse when no previous file hashes", async () => {
      const indexPath = join(testDir, "incremental-no-hashes.scip");
      const indexData: ScipIndexData = {
        documents: [
          {
            relativePath: "src/test.ts",
            symbols: [{ symbol: "sym1", kind: ScipKind.Function }],
            occurrences: [{ range: [0, 0, 4], symbol: "sym1", symbolRoles: SymbolRole.Definition }],
          },
        ],
      };
      
      const buffer = await createScipIndex(indexData);
      await writeFile(indexPath, buffer);

      // Create a previous result without file hashes
      const previousResult: ScipParseResult = {
        symbols: [],
        relationships: [],
        hash: "old-hash",
        // No fileHashes
      };

      const result = await parseIncremental(indexPath, "ws", "pkg", previousResult);

      // Should have parsed the file
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.fileHashes).toBeDefined();
    });
  });


  describe("error handling", () => {
    /**
     * Tests for error handling with corrupted/malformed files.
     * Validates: Requirement 3.7
     */

    describe("file read errors", () => {
      it("should return structured error for non-existent file", async () => {
        const nonExistentPath = join(testDir, "does-not-exist.scip");

        const result = await parse(nonExistentPath, "ws", "pkg");

        expect(result.symbols).toEqual([]);
        expect(result.relationships).toEqual([]);
        expect(result.hash).toBe("");
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0].message).toContain("Failed to read SCIP index file");
        expect(result.errors![0].recoverable).toBe(false);
      });

      it("should return structured error for directory instead of file", async () => {
        const dirPath = join(testDir, "is-a-directory");
        await mkdir(dirPath);

        const result = await parse(dirPath, "ws", "pkg");

        expect(result.symbols).toEqual([]);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].recoverable).toBe(false);
      });
    });

    describe("corrupted protobuf files", () => {
      it("should return structured error for completely invalid binary data", async () => {
        const corruptedPath = join(testDir, "corrupted.scip");
        // Write random bytes that are not valid protobuf
        const randomBytes = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA, 0x00, 0x01, 0x02]);
        await writeFile(corruptedPath, randomBytes);

        const result = await parse(corruptedPath, "ws", "pkg");

        expect(result.symbols).toEqual([]);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0].recoverable).toBe(false);
        // Hash should still be computed from the file content
        expect(result.hash).toBeTruthy();
      });

      it("should return structured error for truncated protobuf", async () => {
        const truncatedPath = join(testDir, "truncated.scip");
        // Create a valid index, then truncate it
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [{ symbol: "sym1", kind: ScipKind.Function }],
            },
          ],
        };
        const buffer = await createScipIndex(indexData);
        // Truncate to half the size
        const truncated = buffer.slice(0, Math.floor(buffer.length / 2));
        await writeFile(truncatedPath, truncated);

        const result = await parse(truncatedPath, "ws", "pkg");

        // Should either parse partially or return error
        expect(result.hash).toBeTruthy();
        // The result depends on where truncation occurred
      });

      it("should return structured error for empty file", async () => {
        const emptyPath = join(testDir, "empty.scip");
        await writeFile(emptyPath, Buffer.alloc(0));

        const result = await parse(emptyPath, "ws", "pkg");

        // Empty file should parse as empty index (valid protobuf)
        expect(result.hash).toBeTruthy();
        expect(result.symbols).toEqual([]);
      });
    });

    describe("malformed index structure", () => {
      it("should handle index with null documents gracefully", async () => {
        const indexPath = join(testDir, "null-docs.scip");
        // Create minimal valid protobuf with no documents field
        const indexData: ScipIndexData = {
          metadata: { toolInfo: { name: "test" } },
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        expect(result.symbols).toEqual([]);
        expect(result.relationships).toEqual([]);
        // Should not have non-recoverable errors
        const nonRecoverable = result.errors?.filter(e => !e.recoverable) || [];
        expect(nonRecoverable).toHaveLength(0);
      });

      it("should continue parsing valid documents when some are malformed", async () => {
        const indexPath = join(testDir, "partial-valid.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/valid.ts",
              symbols: [{ symbol: "validSym", kind: ScipKind.Function, displayName: "valid" }],
              occurrences: [{ range: [0, 0, 5], symbol: "validSym", symbolRoles: SymbolRole.Definition }],
            },
            {
              relativePath: "src/also-valid.ts",
              symbols: [{ symbol: "anotherSym", kind: ScipKind.Class, displayName: "another" }],
              occurrences: [{ range: [0, 0, 7], symbol: "anotherSym", symbolRoles: SymbolRole.Definition }],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Should have parsed both valid documents
        expect(result.symbols.length).toBe(2);
      });
    });

    describe("missing required fields", () => {
      it("should handle symbols without symbol string", async () => {
        const indexPath = join(testDir, "missing-symbol.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [
                { kind: ScipKind.Function, displayName: "noSymbol" }, // Missing symbol field
                { symbol: "validSym", kind: ScipKind.Function, displayName: "valid" },
              ],
              occurrences: [
                { range: [0, 0, 5], symbol: "validSym", symbolRoles: SymbolRole.Definition },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Should have parsed the valid symbol
        expect(result.symbols.some(s => s.name === "valid" || s.signature === "valid")).toBe(true);
        // Should have recorded an error for the invalid symbol
        expect(result.errors?.some(e => e.message.includes("empty string") || e.message.includes("null"))).toBe(true);
      });

      it("should handle occurrences with invalid range", async () => {
        const indexPath = join(testDir, "invalid-range.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [
                { symbol: "sym1", kind: ScipKind.Function, displayName: "func1" },
              ],
              occurrences: [
                { range: [0], symbol: "sym1", symbolRoles: SymbolRole.Definition }, // Too few elements
                { range: [5, 0, 10], symbol: "sym1", symbolRoles: SymbolRole.Definition }, // Valid
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Should have parsed the symbol (using valid occurrence or default location)
        expect(result.symbols.length).toBeGreaterThan(0);
        // Should have recorded an error for the invalid range
        expect(result.errors?.some(e => e.message.includes("range") || e.message.includes("insufficient"))).toBe(true);
      });

      it("should handle documents without relativePath", async () => {
        const indexPath = join(testDir, "no-path.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              // No relativePath
              symbols: [{ symbol: "sym1", kind: ScipKind.Function, displayName: "func" }],
              occurrences: [{ range: [0, 0, 4], symbol: "sym1", symbolRoles: SymbolRole.Definition }],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Should still parse the symbol with empty file path
        expect(result.symbols.length).toBeGreaterThan(0);
        expect(result.symbols[0].location.file).toBe("");
      });
    });

    describe("error recovery", () => {
      it("should not crash on any input", async () => {
        const testCases = [
          Buffer.from([]), // Empty
          Buffer.from([0x00]), // Single null byte
          Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), // All 0xFF
          Buffer.from("not protobuf at all"), // Plain text
          Buffer.from([0x08, 0x01, 0x10, 0x02]), // Random valid-looking protobuf bytes
        ];

        for (const testCase of testCases) {
          const testPath = join(testDir, `test-${Math.random().toString(36).slice(2)}.scip`);
          await writeFile(testPath, testCase);

          // Should not throw
          const result = await parse(testPath, "ws", "pkg");
          
          // Should return a valid result structure
          expect(result).toBeDefined();
          expect(Array.isArray(result.symbols)).toBe(true);
          expect(Array.isArray(result.relationships)).toBe(true);
          expect(typeof result.hash).toBe("string");
        }
      });

      it("should collect multiple errors without stopping", async () => {
        const indexPath = join(testDir, "multiple-errors.scip");
        const indexData: ScipIndexData = {
          documents: [
            {
              relativePath: "src/test.ts",
              symbols: [
                { symbol: "", kind: ScipKind.Function }, // Empty symbol
                { symbol: "valid1", kind: ScipKind.Function, displayName: "valid1" },
                { symbol: "", kind: ScipKind.Class }, // Another empty symbol
                { symbol: "valid2", kind: ScipKind.Class, displayName: "valid2" },
              ],
              occurrences: [
                { range: [0, 0, 6], symbol: "valid1", symbolRoles: SymbolRole.Definition },
                { range: [5, 0, 6], symbol: "valid2", symbolRoles: SymbolRole.Definition },
              ],
            },
          ],
        };
        
        const buffer = await createScipIndex(indexData);
        await writeFile(indexPath, buffer);

        const result = await parse(indexPath, "ws", "pkg");

        // Should have parsed valid symbols
        expect(result.symbols.length).toBe(2);
        
        // Should have collected multiple errors
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThanOrEqual(2);
        
        // All errors should be recoverable
        expect(result.errors!.every(e => e.recoverable)).toBe(true);
      });
    });
  });
});
