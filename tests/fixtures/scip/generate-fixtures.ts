/**
 * SCIP Test Fixture Generator
 *
 * Generates binary SCIP index files for testing the SCIP parser.
 * Run with: npx tsx tests/fixtures/scip/generate-fixtures.ts
 *
 * @see Requirements 3.1-3.7
 */

import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Minimal proto schema for generating test fixtures.
 * This is a simplified version that avoids protobuf alias issues.
 */
const SCIP_PROTO = `
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

/**
 * Type definitions for SCIP index data
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

let protoRoot: protobuf.Root | null = null;

async function loadProtoSchema(): Promise<protobuf.Root> {
  if (protoRoot) {
    return protoRoot;
  }
  protoRoot = protobuf.parse(SCIP_PROTO).root;
  return protoRoot;
}

async function createScipIndex(indexData: ScipIndexData): Promise<Buffer> {
  const root = await loadProtoSchema();
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
 * Generate empty.scip - A valid but empty SCIP index
 */
async function generateEmptyIndex(): Promise<{ buffer: Buffer; json: ScipIndexData }> {
  const indexData: ScipIndexData = {
    metadata: {
      version: 0,
      toolInfo: {
        name: "test-indexer",
        version: "1.0.0",
      },
      projectRoot: "file:///test-project",
    },
    documents: [],
    externalSymbols: [],
  };

  const buffer = await createScipIndex(indexData);
  return { buffer, json: indexData };
}

/**
 * Generate valid-simple.scip - A simple valid SCIP index with a single function
 */
async function generateValidSimpleIndex(): Promise<{ buffer: Buffer; json: ScipIndexData }> {
  const indexData: ScipIndexData = {
    metadata: {
      version: 0,
      toolInfo: {
        name: "scip-typescript",
        version: "0.3.0",
      },
      projectRoot: "file:///project",
    },
    documents: [
      {
        language: "typescript",
        relativePath: "src/index.ts",
        symbols: [
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/index.ts greet.",
            documentation: ["Greets a user by name.", "@param name - The name to greet", "@returns A greeting message"],
            kind: ScipKind.Function,
            displayName: "greet",
            signatureDocumentation: {
              text: "function greet(name: string): string",
            },
          },
        ],
        occurrences: [
          {
            range: [5, 16, 21], // line 5, col 16-21
            symbol: "scip-typescript npm test-package 1.0.0 src/index.ts greet.",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
    ],
    externalSymbols: [],
  };

  const buffer = await createScipIndex(indexData);
  return { buffer, json: indexData };
}

/**
 * Generate valid-multi-symbol.scip - A valid SCIP index with multiple symbol kinds
 */
async function generateValidMultiSymbolIndex(): Promise<{ buffer: Buffer; json: ScipIndexData }> {
  const indexData: ScipIndexData = {
    metadata: {
      version: 0,
      toolInfo: {
        name: "scip-typescript",
        version: "0.3.0",
      },
      projectRoot: "file:///project",
    },
    documents: [
      {
        language: "typescript",
        relativePath: "src/models/User.ts",
        symbols: [
          // Module
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts `User.ts`/",
            documentation: ["User model module"],
            kind: ScipKind.Module,
            displayName: "User.ts",
          },
          // Class
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#",
            documentation: ["Represents a user in the system."],
            kind: ScipKind.Class,
            displayName: "User",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts `User.ts`/",
          },
          // Method
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#getName().",
            documentation: ["Gets the user's full name."],
            kind: ScipKind.Method,
            displayName: "getName",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#",
            signatureDocumentation: {
              text: "getName(): string",
            },
          },
          // Variable (property)
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#name.",
            documentation: ["The user's name."],
            kind: ScipKind.Property,
            displayName: "name",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#",
          },
        ],
        occurrences: [
          {
            range: [0, 0, 0],
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts `User.ts`/",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [3, 13, 17],
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [4, 10, 14],
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#name.",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [6, 2, 9],
            symbol: "scip-typescript npm test-package 1.0.0 src/models/User.ts User#getName().",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/types/index.ts",
        symbols: [
          // Type alias
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/types/index.ts UserId.",
            documentation: ["Type alias for user identifiers."],
            kind: ScipKind.TypeAlias,
            displayName: "UserId",
          },
          // Interface
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/types/index.ts IUserService#",
            documentation: ["Interface for user service operations."],
            kind: ScipKind.Interface,
            displayName: "IUserService",
          },
        ],
        occurrences: [
          {
            range: [0, 12, 18],
            symbol: "scip-typescript npm test-package 1.0.0 src/types/index.ts UserId.",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [2, 17, 29],
            symbol: "scip-typescript npm test-package 1.0.0 src/types/index.ts IUserService#",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/utils/helpers.ts",
        symbols: [
          // Function
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/utils/helpers.ts formatDate.",
            documentation: ["Formats a date to a human-readable string."],
            kind: ScipKind.Function,
            displayName: "formatDate",
            signatureDocumentation: {
              text: "function formatDate(date: Date): string",
            },
          },
          // Variable (constant)
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/utils/helpers.ts DEFAULT_FORMAT.",
            documentation: ["Default date format string."],
            kind: ScipKind.Variable,
            displayName: "DEFAULT_FORMAT",
          },
        ],
        occurrences: [
          {
            range: [0, 13, 27],
            symbol: "scip-typescript npm test-package 1.0.0 src/utils/helpers.ts DEFAULT_FORMAT.",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [2, 16, 26],
            symbol: "scip-typescript npm test-package 1.0.0 src/utils/helpers.ts formatDate.",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
    ],
    externalSymbols: [],
  };

  const buffer = await createScipIndex(indexData);
  return { buffer, json: indexData };
}

/**
 * Generate valid-with-relationships.scip - A valid SCIP index with various relationship types
 */
async function generateValidWithRelationshipsIndex(): Promise<{ buffer: Buffer; json: ScipIndexData }> {
  const indexData: ScipIndexData = {
    metadata: {
      version: 0,
      toolInfo: {
        name: "scip-typescript",
        version: "0.3.0",
      },
      projectRoot: "file:///project",
    },
    documents: [
      {
        language: "typescript",
        relativePath: "src/interfaces.ts",
        symbols: [
          // Base interface
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#",
            documentation: ["Base repository interface."],
            kind: ScipKind.Interface,
            displayName: "IRepository",
          },
          // Interface method
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#findById().",
            documentation: ["Find an entity by ID."],
            kind: ScipKind.Method,
            displayName: "findById",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#",
          },
        ],
        occurrences: [
          {
            range: [0, 17, 28],
            symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [1, 2, 10],
            symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#findById().",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/base.ts",
        symbols: [
          // Base class
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#",
            documentation: ["Base entity class with common properties."],
            kind: ScipKind.Class,
            displayName: "BaseEntity",
          },
          // Base class property
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#id.",
            documentation: ["Entity identifier."],
            kind: ScipKind.Property,
            displayName: "id",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#",
          },
        ],
        occurrences: [
          {
            range: [0, 21, 31],
            symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [1, 2, 4],
            symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#id.",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/UserRepository.ts",
        symbols: [
          // Class that implements interface and extends base
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/UserRepository.ts UserRepository#",
            documentation: ["Repository for user entities."],
            kind: ScipKind.Class,
            displayName: "UserRepository",
            relationships: [
              // Implements IRepository
              {
                symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#",
                isImplementation: true,
              },
            ],
          },
          // Method that implements interface method
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/UserRepository.ts UserRepository#findById().",
            documentation: ["Find a user by ID."],
            kind: ScipKind.Method,
            displayName: "findById",
            enclosingSymbol: "scip-typescript npm test-package 1.0.0 src/UserRepository.ts UserRepository#",
            relationships: [
              // References helper function
              {
                symbol: "scip-typescript npm test-package 1.0.0 src/utils.ts validateId.",
                isReference: true,
              },
            ],
          },
        ],
        occurrences: [
          {
            range: [2, 13, 27],
            symbol: "scip-typescript npm test-package 1.0.0 src/UserRepository.ts UserRepository#",
            symbolRoles: SymbolRole.Definition,
          },
          {
            range: [5, 2, 10],
            symbol: "scip-typescript npm test-package 1.0.0 src/UserRepository.ts UserRepository#findById().",
            symbolRoles: SymbolRole.Definition,
          },
          // Import occurrence
          {
            range: [0, 9, 20],
            symbol: "scip-typescript npm test-package 1.0.0 src/interfaces.ts IRepository#",
            symbolRoles: SymbolRole.Import,
          },
          // Reference occurrence
          {
            range: [6, 11, 21],
            symbol: "scip-typescript npm test-package 1.0.0 src/utils.ts validateId.",
            symbolRoles: SymbolRole.ReadAccess,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/User.ts",
        symbols: [
          // Class that extends base
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/User.ts User#",
            documentation: ["User entity."],
            kind: ScipKind.Class,
            displayName: "User",
            relationships: [
              // Extends BaseEntity
              {
                symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#",
                isTypeDefinition: true,
              },
            ],
          },
        ],
        occurrences: [
          {
            range: [2, 13, 17],
            symbol: "scip-typescript npm test-package 1.0.0 src/User.ts User#",
            symbolRoles: SymbolRole.Definition,
          },
          // Import of base class
          {
            range: [0, 9, 19],
            symbol: "scip-typescript npm test-package 1.0.0 src/base.ts BaseEntity#",
            symbolRoles: SymbolRole.Import,
          },
        ],
      },
      {
        language: "typescript",
        relativePath: "src/utils.ts",
        symbols: [
          // Helper function referenced by UserRepository
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/utils.ts validateId.",
            documentation: ["Validates an entity ID."],
            kind: ScipKind.Function,
            displayName: "validateId",
          },
        ],
        occurrences: [
          {
            range: [0, 16, 26],
            symbol: "scip-typescript npm test-package 1.0.0 src/utils.ts validateId.",
            symbolRoles: SymbolRole.Definition,
          },
        ],
      },
    ],
    externalSymbols: [],
  };

  const buffer = await createScipIndex(indexData);
  return { buffer, json: indexData };
}

/**
 * Generate malformed-truncated.scip - A truncated/incomplete SCIP file
 */
async function generateMalformedTruncatedIndex(): Promise<{ buffer: Buffer; description: string }> {
  // Create a valid index first, then truncate it
  const validData: ScipIndexData = {
    metadata: {
      version: 0,
      toolInfo: {
        name: "scip-typescript",
        version: "0.3.0",
      },
      projectRoot: "file:///project",
    },
    documents: [
      {
        language: "typescript",
        relativePath: "src/index.ts",
        symbols: [
          {
            symbol: "scip-typescript npm test-package 1.0.0 src/index.ts test.",
            kind: ScipKind.Function,
            displayName: "test",
          },
        ],
      },
    ],
  };

  const validBuffer = await createScipIndex(validData);
  // Truncate to about 60% of the original size
  const truncatedBuffer = validBuffer.subarray(0, Math.floor(validBuffer.length * 0.6));

  return {
    buffer: truncatedBuffer,
    description: "Truncated SCIP index - binary data cut off mid-stream",
  };
}

/**
 * Generate malformed-invalid-protobuf.scip - Invalid protobuf data
 */
function generateMalformedInvalidProtobuf(): { buffer: Buffer; description: string } {
  // Create random bytes that are not valid protobuf
  const invalidBuffer = Buffer.from([
    0x08, 0xff, 0xff, 0xff, 0xff, // Invalid varint
    0x12, 0x00, // Empty string field
    0x1a, 0xff, // Invalid length prefix
    0x00, 0x00, 0x00, 0x00, // Padding
    0xde, 0xad, 0xbe, 0xef, // Random bytes
  ]);

  return {
    buffer: invalidBuffer,
    description: "Invalid protobuf data that cannot be decoded",
  };
}

/**
 * Generate malformed-wrong-schema.scip - Valid protobuf but wrong message type
 */
async function generateMalformedWrongSchema(): Promise<{ buffer: Buffer; description: string }> {
  // Create a protobuf message that is valid but uses a different schema
  // We'll encode a simple message that doesn't match the SCIP Index schema
  const wrongSchemaProto = `
    syntax = "proto3";
    package wrong;
    message WrongMessage {
      string wrong_field = 1;
      int32 another_wrong_field = 2;
      repeated string list_field = 3;
    }
  `;

  const wrongRoot = protobuf.parse(wrongSchemaProto).root;
  const WrongType = wrongRoot.lookupType("wrong.WrongMessage");

  const wrongData = {
    wrongField: "This is not a SCIP index",
    anotherWrongField: 42,
    listField: ["item1", "item2", "item3"],
  };

  const message = WrongType.create(wrongData);
  const buffer = Buffer.from(WrongType.encode(message).finish());

  return {
    buffer,
    description: "Valid protobuf but wrong message schema (not a SCIP Index)",
  };
}

/**
 * Main function to generate all fixtures
 */
async function main(): Promise<void> {
  console.log("Generating SCIP test fixtures...\n");

  // Generate empty index
  console.log("Generating empty.scip...");
  const empty = await generateEmptyIndex();
  await writeFile(join(__dirname, "empty.scip"), empty.buffer);
  await writeFile(join(__dirname, "empty.json"), JSON.stringify(empty.json, null, 2));
  console.log(`  Created empty.scip (${empty.buffer.length} bytes)`);

  // Generate valid simple index
  console.log("Generating valid-simple.scip...");
  const validSimple = await generateValidSimpleIndex();
  await writeFile(join(__dirname, "valid-simple.scip"), validSimple.buffer);
  await writeFile(join(__dirname, "valid-simple.json"), JSON.stringify(validSimple.json, null, 2));
  console.log(`  Created valid-simple.scip (${validSimple.buffer.length} bytes)`);

  // Generate valid multi-symbol index
  console.log("Generating valid-multi-symbol.scip...");
  const validMultiSymbol = await generateValidMultiSymbolIndex();
  await writeFile(join(__dirname, "valid-multi-symbol.scip"), validMultiSymbol.buffer);
  await writeFile(join(__dirname, "valid-multi-symbol.json"), JSON.stringify(validMultiSymbol.json, null, 2));
  console.log(`  Created valid-multi-symbol.scip (${validMultiSymbol.buffer.length} bytes)`);

  // Generate valid with relationships index
  console.log("Generating valid-with-relationships.scip...");
  const validWithRelationships = await generateValidWithRelationshipsIndex();
  await writeFile(join(__dirname, "valid-with-relationships.scip"), validWithRelationships.buffer);
  await writeFile(join(__dirname, "valid-with-relationships.json"), JSON.stringify(validWithRelationships.json, null, 2));
  console.log(`  Created valid-with-relationships.scip (${validWithRelationships.buffer.length} bytes)`);

  // Generate malformed truncated index
  console.log("Generating malformed-truncated.scip...");
  const malformedTruncated = await generateMalformedTruncatedIndex();
  await writeFile(join(__dirname, "malformed-truncated.scip"), malformedTruncated.buffer);
  await writeFile(join(__dirname, "malformed-truncated.txt"), malformedTruncated.description);
  console.log(`  Created malformed-truncated.scip (${malformedTruncated.buffer.length} bytes)`);

  // Generate malformed invalid protobuf
  console.log("Generating malformed-invalid-protobuf.scip...");
  const malformedInvalid = generateMalformedInvalidProtobuf();
  await writeFile(join(__dirname, "malformed-invalid-protobuf.scip"), malformedInvalid.buffer);
  await writeFile(join(__dirname, "malformed-invalid-protobuf.txt"), malformedInvalid.description);
  console.log(`  Created malformed-invalid-protobuf.scip (${malformedInvalid.buffer.length} bytes)`);

  // Generate malformed wrong schema
  console.log("Generating malformed-wrong-schema.scip...");
  const malformedWrongSchema = await generateMalformedWrongSchema();
  await writeFile(join(__dirname, "malformed-wrong-schema.scip"), malformedWrongSchema.buffer);
  await writeFile(join(__dirname, "malformed-wrong-schema.txt"), malformedWrongSchema.description);
  console.log(`  Created malformed-wrong-schema.scip (${malformedWrongSchema.buffer.length} bytes)`);

  console.log("\nAll fixtures generated successfully!");
}

main().catch((error) => {
  console.error("Error generating fixtures:", error);
  process.exit(1);
});
