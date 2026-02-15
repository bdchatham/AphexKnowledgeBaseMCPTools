/**
 * Property-Based Tests for Documentation Generator
 *
 * Tests Property 13: Documentation Co-location
 * Tests Property 14: Documentation Content Completeness
 *
 * Property 13: For any source file at path `<dir>/<name>.<ext>`, the generated
 * documentation SHALL be written to `<dir>/<name>.archon.md` in the same directory.
 *
 * Property 14: For any generated documentation file, the content SHALL include
 * symbol information from the SCIP index and SHALL contain valid ARN references
 * to related symbols.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4**
 *
 * @see Design Document: Property 13: Documentation Co-location
 * @see Design Document: Property 14: Documentation Content Completeness
 */

import * as fc from "fast-check";
import {
  generateForSymbol,
  generateForFile,
} from "../../src/lib/doc_generator.js";
import type { ScipSymbol, ScipRelationship, SymbolKind, RelationshipType } from "../../src/types/scip.js";

/**
 * Valid symbol kinds as defined in the SCIP types
 */
const VALID_SYMBOL_KINDS: SymbolKind[] = [
  "function",
  "class",
  "method",
  "variable",
  "type",
  "module",
];

/**
 * Common file extensions for source files
 */
const FILE_EXTENSIONS = [
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
];

/**
 * Arbitrary for generating valid directory names
 * - Alphanumeric characters and underscores
 * - Non-empty strings
 * - No special characters that would break paths
 */
const directoryNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split(
        ""
      )
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0 && !s.startsWith("-"));

/**
 * Arbitrary for generating valid file names (without extension)
 * - Alphanumeric characters and underscores
 * - Non-empty strings
 * - Must start with a letter or underscore
 */
const fileNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
        ""
      )
    ),
    { minLength: 1, maxLength: 30 }
  )
  .filter(
    (s) =>
      s.length > 0 &&
      /^[a-zA-Z_]/.test(s) // Must start with letter or underscore
  );

/**
 * Arbitrary for generating file extensions
 */
const extensionArb = fc.constantFrom(...FILE_EXTENSIONS);

/**
 * Arbitrary for generating directory paths with variable depth (0-10 levels)
 * - Depth 0 means file is at root (no directory prefix)
 * - Depth 1-10 means nested directories
 */
const directoryPathArb = fc
  .array(directoryNameArb, { minLength: 0, maxLength: 10 })
  .map((segments) => (segments.length > 0 ? segments.join("/") : ""));

/**
 * Arbitrary for generating complete source file paths
 * Format: <dir>/<name>.<ext> or <name>.<ext> (if no directory)
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
 * Arbitrary for generating valid symbol kinds
 */
const symbolKindArb = fc.constantFrom(...VALID_SYMBOL_KINDS);

/**
 * Arbitrary for generating valid symbol names
 */
const symbolNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
        ""
      )
    ),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => s.length > 0 && /^[a-zA-Z_]/.test(s));

/**
 * Arbitrary for generating optional documentation strings
 */
const documentationArb = fc.option(
  fc.string({ minLength: 1, maxLength: 200 }),
  { nil: undefined }
);

/**
 * Arbitrary for generating optional signature strings
 */
const signatureArb = fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
  nil: undefined,
});

/**
 * Arbitrary for generating line numbers
 */
const lineNumberArb = fc.integer({ min: 1, max: 10000 });

/**
 * Arbitrary for generating column numbers
 */
const columnNumberArb = fc.integer({ min: 0, max: 200 });

/**
 * Generate a ScipSymbol from arbitrary components
 */
function createScipSymbol(
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
 * Extract the expected documentation path from a source path.
 * This is the reference implementation for the property test.
 *
 * For a source file at `<dir>/<name>.<ext>`, the expected doc path is `<dir>/<name>.archon.md`
 * For a source file at `<name>.<ext>` (no directory), the expected doc path is `<name>.archon.md`
 */
function getExpectedDocPath(sourcePath: string): string {
  const lastDotIndex = sourcePath.lastIndexOf(".");
  if (lastDotIndex > 0) {
    return `${sourcePath.slice(0, lastDotIndex)}.archon.md`;
  }
  return `${sourcePath}.archon.md`;
}

/**
 * Extract the directory from a file path.
 * Returns empty string if file is at root.
 */
function getDirectory(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  if (lastSlashIndex > 0) {
    return filePath.slice(0, lastSlashIndex);
  }
  return "";
}

/**
 * Extract the file name (without extension) from a file path.
 * Handles both regular extensions (.ts, .js) and compound extensions (.archon.md).
 */
function getFileNameWithoutExtension(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  const fileName =
    lastSlashIndex >= 0 ? filePath.slice(lastSlashIndex + 1) : filePath;
  
  // Handle .archon.md extension specially
  if (fileName.endsWith(".archon.md")) {
    return fileName.slice(0, -".archon.md".length);
  }
  
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex > 0) {
    return fileName.slice(0, lastDotIndex);
  }
  return fileName;
}

describe("Feature: documentation-tools, Property 13: Documentation Co-location", () => {
  /**
   * Property 13.1: Documentation path follows co-location pattern for generateForSymbol
   *
   * For any source file at path `<dir>/<name>.<ext>`, calling generateForSymbol
   * SHALL produce documentation at `<dir>/<name>.archon.md`.
   *
   * **Validates: Requirement 4.2**
   */
  it("should generate documentation path co-located with source file (generateForSymbol)", () => {
    fc.assert(
      fc.property(
        sourceFilePathArb,
        symbolNameArb,
        symbolKindArb,
        lineNumberArb,
        columnNumberArb,
        documentationArb,
        signatureArb,
        (sourcePath, symbolName, kind, line, column, documentation, signature) => {
          // Create a symbol at the given source path
          const symbol = createScipSymbol(
            symbolName,
            kind,
            sourcePath,
            line,
            column,
            documentation ?? undefined,
            signature ?? undefined
          );

          // Generate documentation for the symbol
          const result = generateForSymbol(symbol, []);

          // Calculate expected doc path
          const expectedDocPath = getExpectedDocPath(sourcePath);

          // Verify the doc path matches the expected co-located path
          expect(result.docPath).toBe(expectedDocPath);

          // Verify the source path is preserved
          expect(result.sourcePath).toBe(sourcePath);

          // Verify the doc path ends with .archon.md
          expect(result.docPath.endsWith(".archon.md")).toBe(true);

          // Verify the doc path is in the same directory as the source
          const sourceDir = getDirectory(sourcePath);
          const docDir = getDirectory(result.docPath);
          expect(docDir).toBe(sourceDir);

          // Verify the base name (without extension) is preserved
          const sourceBaseName = getFileNameWithoutExtension(sourcePath);
          const docBaseName = getFileNameWithoutExtension(result.docPath);
          expect(docBaseName).toBe(sourceBaseName);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: Documentation path follows co-location pattern for generateForFile
   *
   * For any source file at path `<dir>/<name>.<ext>`, calling generateForFile
   * SHALL produce documentation at `<dir>/<name>.archon.md`.
   *
   * **Validates: Requirement 4.2**
   */
  it("should generate documentation path co-located with source file (generateForFile)", () => {
    fc.assert(
      fc.property(sourceFilePathArb, (sourcePath) => {
        // Generate documentation for the file (with empty symbols list)
        const result = generateForFile(sourcePath, [], []);

        // Calculate expected doc path
        const expectedDocPath = getExpectedDocPath(sourcePath);

        // Verify the doc path matches the expected co-located path
        expect(result.docPath).toBe(expectedDocPath);

        // Verify the source path is preserved
        expect(result.sourcePath).toBe(sourcePath);

        // Verify the doc path ends with .archon.md
        expect(result.docPath.endsWith(".archon.md")).toBe(true);

        // Verify the doc path is in the same directory as the source
        const sourceDir = getDirectory(sourcePath);
        const docDir = getDirectory(result.docPath);
        expect(docDir).toBe(sourceDir);

        // Verify the base name (without extension) is preserved
        const sourceBaseName = getFileNameWithoutExtension(sourcePath);
        const docBaseName = getFileNameWithoutExtension(result.docPath);
        expect(docBaseName).toBe(sourceBaseName);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: Documentation co-location works for various directory depths
   *
   * For source files at any directory depth (0-10 levels), the documentation
   * SHALL be co-located in the same directory.
   *
   * **Validates: Requirement 4.2**
   */
  it("should maintain co-location for various directory depths (0-10 levels)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fileNameArb,
        extensionArb,
        (depth, fileName, ext) => {
          // Generate directory path with specific depth
          const dirSegments = Array.from(
            { length: depth },
            (_, i) => `dir${i}`
          );
          const dirPath = dirSegments.join("/");
          const sourcePath =
            dirPath.length > 0 ? `${dirPath}/${fileName}${ext}` : `${fileName}${ext}`;

          // Generate documentation for the file
          const result = generateForFile(sourcePath, [], []);

          // Verify co-location
          const expectedDocPath = getExpectedDocPath(sourcePath);
          expect(result.docPath).toBe(expectedDocPath);

          // Verify directory is preserved
          const sourceDir = getDirectory(sourcePath);
          const docDir = getDirectory(result.docPath);
          expect(docDir).toBe(sourceDir);

          // Count directory depth in result
          const resultDepth =
            result.docPath.split("/").length - 1; // -1 for the file itself
          expect(resultDepth).toBe(depth);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: Documentation co-location works for all supported file extensions
   *
   * For source files with any supported extension, the documentation
   * SHALL be co-located with the correct .archon.md extension.
   *
   * **Validates: Requirement 4.2**
   */
  it("should maintain co-location for all supported file extensions", () => {
    fc.assert(
      fc.property(
        directoryPathArb,
        fileNameArb,
        extensionArb,
        (dirPath, fileName, ext) => {
          const sourcePath =
            dirPath.length > 0 ? `${dirPath}/${fileName}${ext}` : `${fileName}${ext}`;

          // Generate documentation for the file
          const result = generateForFile(sourcePath, [], []);

          // Verify the original extension is replaced with .archon.md
          expect(result.docPath.endsWith(".archon.md")).toBe(true);
          expect(result.docPath).not.toContain(ext + ".archon.md"); // Should replace, not append

          // Verify the base name is preserved
          const sourceBaseName = getFileNameWithoutExtension(sourcePath);
          const docBaseName = getFileNameWithoutExtension(result.docPath);
          expect(docBaseName).toBe(sourceBaseName);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: Documentation co-location is deterministic
   *
   * For any source file path, generating documentation multiple times
   * SHALL always produce the same doc path.
   *
   * **Validates: Requirement 4.2**
   */
  it("should produce deterministic doc paths for same source path", () => {
    fc.assert(
      fc.property(sourceFilePathArb, (sourcePath) => {
        // Generate documentation multiple times
        const result1 = generateForFile(sourcePath, [], []);
        const result2 = generateForFile(sourcePath, [], []);
        const result3 = generateForFile(sourcePath, [], []);

        // All doc paths should be identical
        expect(result1.docPath).toBe(result2.docPath);
        expect(result2.docPath).toBe(result3.docPath);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.6: Documentation co-location preserves directory structure
   *
   * For any source file path with nested directories, the documentation
   * SHALL preserve the exact directory structure.
   *
   * **Validates: Requirement 4.2**
   */
  it("should preserve exact directory structure in doc path", () => {
    fc.assert(
      fc.property(
        fc.array(directoryNameArb, { minLength: 1, maxLength: 10 }),
        fileNameArb,
        extensionArb,
        (dirSegments, fileName, ext) => {
          const dirPath = dirSegments.join("/");
          const sourcePath = `${dirPath}/${fileName}${ext}`;

          // Generate documentation for the file
          const result = generateForFile(sourcePath, [], []);

          // Extract directory from doc path
          const docDir = getDirectory(result.docPath);

          // Directory should be exactly preserved
          expect(docDir).toBe(dirPath);

          // Each directory segment should be present in order
          const docDirSegments = docDir.split("/");
          expect(docDirSegments).toEqual(dirSegments);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.7: Documentation co-location works with symbols at various locations
   *
   * For symbols at any line/column in a source file, the documentation
   * SHALL be co-located with the source file regardless of symbol location.
   *
   * **Validates: Requirement 4.2**
   */
  it("should maintain co-location regardless of symbol location in file", () => {
    fc.assert(
      fc.property(
        sourceFilePathArb,
        symbolNameArb,
        symbolKindArb,
        lineNumberArb,
        columnNumberArb,
        (sourcePath, symbolName, kind, line, column) => {
          // Create symbol at various locations
          const symbol = createScipSymbol(
            symbolName,
            kind,
            sourcePath,
            line,
            column
          );

          // Generate documentation
          const result = generateForSymbol(symbol, []);

          // Doc path should be co-located regardless of line/column
          const expectedDocPath = getExpectedDocPath(sourcePath);
          expect(result.docPath).toBe(expectedDocPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.8: Documentation co-location works with all symbol kinds
   *
   * For symbols of any kind (function, class, method, etc.), the documentation
   * SHALL be co-located with the source file.
   *
   * **Validates: Requirement 4.2**
   */
  it("should maintain co-location for all symbol kinds", () => {
    fc.assert(
      fc.property(
        sourceFilePathArb,
        symbolNameArb,
        symbolKindArb,
        (sourcePath, symbolName, kind) => {
          // Create symbol of the given kind
          const symbol = createScipSymbol(symbolName, kind, sourcePath, 1, 0);

          // Generate documentation
          const result = generateForSymbol(symbol, []);

          // Doc path should be co-located
          const expectedDocPath = getExpectedDocPath(sourcePath);
          expect(result.docPath).toBe(expectedDocPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.9: Documentation path never contains double extensions
   *
   * For any source file, the generated documentation path SHALL NOT
   * contain the original extension followed by .archon.md (e.g., no .ts.archon.md).
   *
   * **Validates: Requirement 4.2**
   */
  it("should not produce double extensions in doc path", () => {
    fc.assert(
      fc.property(sourceFilePathArb, extensionArb, (sourcePath, ext) => {
        // Generate documentation
        const result = generateForFile(sourcePath, [], []);

        // Should not have double extension pattern
        for (const extension of FILE_EXTENSIONS) {
          expect(result.docPath).not.toContain(`${extension}.archon.md`);
        }

        // Should end with exactly .archon.md
        expect(result.docPath.endsWith(".archon.md")).toBe(true);

        // Count occurrences of .archon.md - should be exactly 1
        const archonMdCount = (result.docPath.match(/\.archon\.md/g) || [])
          .length;
        expect(archonMdCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.10: Documentation co-location works for files at root level
   *
   * For source files at the root level (no directory prefix), the documentation
   * SHALL also be at the root level.
   *
   * **Validates: Requirement 4.2**
   */
  it("should maintain co-location for files at root level (no directory)", () => {
    fc.assert(
      fc.property(fileNameArb, extensionArb, (fileName, ext) => {
        const sourcePath = `${fileName}${ext}`;

        // Generate documentation
        const result = generateForFile(sourcePath, [], []);

        // Doc path should have no directory prefix
        expect(result.docPath).not.toContain("/");

        // Should be just <name>.archon.md
        expect(result.docPath).toBe(`${fileName}.archon.md`);
      }),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 14: Documentation Content Completeness
// ============================================================================

/**
 * Valid relationship types as defined in the SCIP types
 */
const VALID_RELATIONSHIP_TYPES: RelationshipType[] = [
  "references",
  "implements",
  "extends",
  "imports",
  "contains",
];

/**
 * Arbitrary for generating relationship types
 */
const relationshipTypeArb = fc.constantFrom(...VALID_RELATIONSHIP_TYPES);

/**
 * Arbitrary for generating valid ARN strings
 */
const arnArb = fc
  .tuple(
    fc.constantFrom("code", "doc"),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
      minLength: 1,
      maxLength: 15,
    }),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
      minLength: 1,
      maxLength: 15,
    }),
    fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz/_.".split("")),
      { minLength: 1, maxLength: 30 }
    ),
    symbolNameArb
  )
  .map(
    ([type, workspace, pkg, path, symbol]) =>
      `arn:archon:${type}:${workspace}/${pkg}/${path}#${symbol}`
  );

/**
 * Create a ScipSymbol with all fields populated
 */
function createFullScipSymbol(
  name: string,
  kind: SymbolKind,
  filePath: string,
  line: number,
  column: number,
  documentation: string | undefined,
  signature: string | undefined
): ScipSymbol {
  const arn = `arn:archon:code:workspace/package/${filePath}#${name}`;
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
    arn,
  };
}

/**
 * Arbitrary for generating ScipSymbol objects with various kinds and optional fields
 */
const scipSymbolArb = fc
  .tuple(
    symbolNameArb,
    symbolKindArb,
    sourceFilePathArb,
    lineNumberArb,
    columnNumberArb,
    documentationArb,
    signatureArb
  )
  .map(([name, kind, filePath, line, column, documentation, signature]) =>
    createFullScipSymbol(
      name,
      kind,
      filePath,
      line,
      column,
      documentation ?? undefined,
      signature ?? undefined
    )
  );

/**
 * Arbitrary for generating ScipRelationship objects
 */
const scipRelationshipArb = (sourceArn: string) =>
  fc.tuple(arnArb, relationshipTypeArb).map(([targetArn, type]) => ({
    from: sourceArn,
    to: targetArn,
    type,
  }));

/**
 * Arbitrary for generating arrays of relationships for a symbol
 */
const relationshipsArb = (sourceArn: string) =>
  fc.array(scipRelationshipArb(sourceArn), { minLength: 0, maxLength: 5 });

describe("Feature: documentation-tools, Property 14: Documentation Content Completeness", () => {
  /**
   * Property 14.1: Generated documentation includes symbol name in title
   *
   * For any symbol, the generated documentation SHALL include the symbol name
   * as the title (H1 heading).
   *
   * **Validates: Requirement 4.3**
   */
  it("should include symbol name in documentation title", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should start with a heading containing the symbol name
        expect(result.content).toContain(`# ${symbol.name}`);

        // The title should be at the beginning of the document
        const firstLine = result.content.split("\n")[0];
        expect(firstLine).toBe(`# ${symbol.name}`);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.2: Generated documentation includes symbol kind description
   *
   * For any symbol, the generated documentation SHALL include a description
   * of the symbol kind (function, class, method, etc.).
   *
   * **Validates: Requirement 4.3**
   */
  it("should include symbol kind description in documentation", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should mention the symbol kind
        const kindDescriptions: Record<SymbolKind, string> = {
          function: "function",
          class: "class",
          method: "method",
          variable: "variable",
          type: "type definition",
          module: "module",
        };

        const expectedKindDescription = kindDescriptions[symbol.kind];
        expect(result.content.toLowerCase()).toContain(
          expectedKindDescription.toLowerCase()
        );
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.3: Generated documentation includes source file location
   *
   * For any symbol, the generated documentation SHALL include the source file
   * path and line number where the symbol is defined.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include source file location in documentation", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should include the source file path
        expect(result.content).toContain(symbol.location.file);

        // The content should include the line number
        expect(result.content).toContain(`line ${symbol.location.line}`);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.4: Generated documentation includes symbol documentation when provided
   *
   * For any symbol with documentation, the generated documentation SHALL include
   * the documentation string from the SCIP index.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include symbol documentation when provided", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            symbolNameArb,
            symbolKindArb,
            sourceFilePathArb,
            lineNumberArb,
            columnNumberArb,
            fc.string({ minLength: 1, maxLength: 200 }), // Non-empty documentation
            signatureArb
          )
          .map(
            ([name, kind, filePath, line, column, documentation, signature]) =>
              createFullScipSymbol(
                name,
                kind,
                filePath,
                line,
                column,
                documentation,
                signature ?? undefined
              )
          ),
        (symbol) => {
          const result = generateForSymbol(symbol, []);

          // The content should include the documentation string
          expect(result.content).toContain(symbol.documentation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.5: Generated documentation includes symbol signature when provided
   *
   * For any symbol with a signature, the generated documentation SHALL include
   * the signature from the SCIP index.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include symbol signature when provided", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            symbolNameArb,
            symbolKindArb,
            sourceFilePathArb,
            lineNumberArb,
            columnNumberArb,
            documentationArb,
            fc.string({ minLength: 1, maxLength: 100 }) // Non-empty signature
          )
          .map(
            ([name, kind, filePath, line, column, documentation, signature]) =>
              createFullScipSymbol(
                name,
                kind,
                filePath,
                line,
                column,
                documentation ?? undefined,
                signature
              )
          ),
        (symbol) => {
          const result = generateForSymbol(symbol, []);

          // The content should include the signature
          expect(result.content).toContain(symbol.signature);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.6: Generated documentation includes ARN references for related symbols
   *
   * For any symbol with relationships, the generated documentation SHALL include
   * valid ARN references to related symbols in the format [SymbolName](arn:archon:...).
   *
   * **Validates: Requirement 4.4**
   */
  it("should include ARN references for related symbols", () => {
    fc.assert(
      fc.property(
        scipSymbolArb.chain((symbol) =>
          fc.tuple(
            fc.constant(symbol),
            fc.array(scipRelationshipArb(symbol.arn), {
              minLength: 1,
              maxLength: 5,
            })
          )
        ),
        ([symbol, relationships]) => {
          const result = generateForSymbol(symbol, relationships);

          // For each relationship, the target ARN should be referenced in the content
          for (const rel of relationships) {
            // The ARN should appear in a markdown link format
            expect(result.content).toContain(`](${rel.to})`);
          }

          // The referencedArns array should contain all related ARNs
          for (const rel of relationships) {
            expect(result.referencedArns).toContain(rel.to);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.7: ARN references use valid markdown link format
   *
   * For any symbol with relationships, the ARN references SHALL use the format
   * [SymbolName](arn:archon:...) as specified in Requirement 4.4.
   *
   * **Validates: Requirement 4.4**
   */
  it("should use valid markdown link format for ARN references", () => {
    fc.assert(
      fc.property(
        scipSymbolArb.chain((symbol) =>
          fc.tuple(
            fc.constant(symbol),
            fc.array(scipRelationshipArb(symbol.arn), {
              minLength: 1,
              maxLength: 5,
            })
          )
        ),
        ([symbol, relationships]) => {
          const result = generateForSymbol(symbol, relationships);

          // Check that ARN references follow the markdown link pattern
          // Pattern: [SomeName](arn:archon:type:workspace/package/path#symbol)
          const arnLinkPattern = /\[([^\]]+)\]\((arn:archon:[^)]+)\)/g;
          const matches = [...result.content.matchAll(arnLinkPattern)];

          // Should have at least as many ARN links as relationships
          expect(matches.length).toBeGreaterThanOrEqual(relationships.length);

          // Each match should have a valid ARN format
          for (const match of matches) {
            const arn = match[2];
            expect(arn).toMatch(/^arn:archon:(code|doc):[^/]+\/[^/]+\/[^#]+#.+$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.8: Generated documentation includes source ARN metadata
   *
   * For any symbol, the generated documentation SHALL include the symbol's ARN
   * in the metadata section.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include source ARN in documentation metadata", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should include the source ARN in a comment
        expect(result.content).toContain(`<!-- source-arn: ${symbol.arn} -->`);

        // The result should also have the ARN in the arn field
        expect(result.arn).toBe(symbol.arn);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.9: Generated documentation includes archon:generated marker
   *
   * For any symbol, the generated documentation SHALL include the archon:generated
   * marker to indicate it was auto-generated.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include archon:generated marker in documentation", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should include the archon:generated marker
        expect(result.content).toContain("<!-- archon:generated -->");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.10: Generated documentation includes source provenance
   *
   * For any symbol, the generated documentation SHALL include a Source section
   * with the source file path for provenance tracking.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include source provenance in documentation", () => {
    fc.assert(
      fc.property(scipSymbolArb, (symbol) => {
        const result = generateForSymbol(symbol, []);

        // The content should include a Source section
        expect(result.content).toContain("**Source**");

        // The Source section should reference the source file
        expect(result.content).toContain(`\`${symbol.location.file}\``);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.11: File documentation includes all symbol information
   *
   * For any file with symbols, the generated file documentation SHALL include
   * information about all symbols in the file.
   *
   * **Validates: Requirement 4.3**
   */
  it("should include all symbol information in file documentation", () => {
    fc.assert(
      fc.property(
        sourceFilePathArb,
        fc.array(scipSymbolArb, { minLength: 1, maxLength: 5 }),
        (filePath, symbols) => {
          // Adjust symbols to have the same file path
          const adjustedSymbols = symbols.map((s) => ({
            ...s,
            location: { ...s.location, file: filePath },
            arn: `arn:archon:code:workspace/package/${filePath}#${s.name}`,
          }));

          const result = generateForFile(filePath, adjustedSymbols, []);

          // Each symbol name should appear in the documentation
          for (const symbol of adjustedSymbols) {
            expect(result.content).toContain(symbol.name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.12: File documentation includes ARN references for relationships
   *
   * For any file with symbols that have relationships, the generated file documentation
   * SHALL include ARN references to related symbols.
   *
   * **Validates: Requirement 4.4**
   */
  it("should include ARN references in file documentation for relationships", () => {
    fc.assert(
      fc.property(
        sourceFilePathArb,
        fc.array(scipSymbolArb, { minLength: 1, maxLength: 3 }),
        (filePath, symbols) => {
          // Adjust symbols to have the same file path
          const adjustedSymbols = symbols.map((s) => ({
            ...s,
            location: { ...s.location, file: filePath },
            arn: `arn:archon:code:workspace/package/${filePath}#${s.name}`,
          }));

          // Create relationships for each symbol
          const relationships: ScipRelationship[] = [];
          for (const symbol of adjustedSymbols) {
            relationships.push({
              from: symbol.arn,
              to: `arn:archon:code:workspace/otherpackage/other.ts#OtherSymbol`,
              type: "references",
            });
          }

          const result = generateForFile(
            filePath,
            adjustedSymbols,
            relationships
          );

          // The referenced ARNs should be tracked
          expect(result.referencedArns.length).toBeGreaterThan(0);

          // The content should contain ARN links
          expect(result.content).toContain("](arn:archon:");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.13: Documentation content completeness for all symbol kinds
   *
   * For any symbol kind (function, class, method, module, variable, type),
   * the generated documentation SHALL include the required symbol information.
   *
   * **Validates: Requirements 4.3, 4.4**
   */
  it("should generate complete documentation for all symbol kinds", () => {
    fc.assert(
      fc.property(
        symbolKindArb,
        symbolNameArb,
        sourceFilePathArb,
        lineNumberArb,
        columnNumberArb,
        (kind, name, filePath, line, column) => {
          const symbol = createFullScipSymbol(
            name,
            kind,
            filePath,
            line,
            column,
            `Documentation for ${name}`,
            `${kind} ${name}()`
          );

          const result = generateForSymbol(symbol, []);

          // All required elements should be present
          expect(result.content).toContain(`# ${name}`); // Title
          expect(result.content).toContain("<!-- archon:generated -->"); // Marker
          expect(result.content).toContain(`<!-- source-arn: ${symbol.arn} -->`); // ARN
          expect(result.content).toContain(filePath); // Source file
          expect(result.content).toContain(`line ${line}`); // Line number
          expect(result.content).toContain(`Documentation for ${name}`); // Documentation
          expect(result.content).toContain(`${kind} ${name}()`); // Signature
          expect(result.content).toContain("**Source**"); // Provenance
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.14: Documentation includes relationship type descriptions
   *
   * For any symbol with relationships, the generated documentation SHALL include
   * human-readable descriptions of the relationship types.
   *
   * **Validates: Requirement 4.4**
   */
  it("should include relationship type descriptions in documentation", () => {
    fc.assert(
      fc.property(
        scipSymbolArb,
        relationshipTypeArb,
        arnArb,
        (symbol, relType, targetArn) => {
          const relationships: ScipRelationship[] = [
            {
              from: symbol.arn,
              to: targetArn,
              type: relType,
            },
          ];

          const result = generateForSymbol(symbol, relationships);

          // The relationship type should be described in human-readable form
          const typeDescriptions: Record<RelationshipType, string> = {
            contains: "Contains",
            references: "References",
            implements: "Implements",
            extends: "Extends",
            imports: "Imports",
          };

          expect(result.content).toContain(typeDescriptions[relType]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.15: referencedArns array is complete
   *
   * For any symbol with relationships, the referencedArns array in the result
   * SHALL contain all ARNs referenced in the documentation.
   *
   * **Validates: Requirement 4.4**
   */
  it("should have complete referencedArns array", () => {
    fc.assert(
      fc.property(
        scipSymbolArb.chain((symbol) =>
          fc.tuple(
            fc.constant(symbol),
            fc.array(scipRelationshipArb(symbol.arn), {
              minLength: 1,
              maxLength: 5,
            })
          )
        ),
        ([symbol, relationships]) => {
          const result = generateForSymbol(symbol, relationships);

          // All relationship target ARNs should be in referencedArns
          const targetArns = relationships.map((r) => r.to);
          for (const targetArn of targetArns) {
            expect(result.referencedArns).toContain(targetArn);
          }

          // referencedArns should not have duplicates
          const uniqueArns = new Set(result.referencedArns);
          expect(uniqueArns.size).toBe(result.referencedArns.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 15: Manual Section Preservation
// ============================================================================

import { preserveManualSections, extractManualSections } from "../../src/lib/doc_generator.js";

/**
 * Manual section marker constants (matching the implementation)
 */
const MANUAL_SECTION_START = "<!-- archon:manual -->";
const MANUAL_SECTION_END = "<!-- /archon:manual -->";

/**
 * Arbitrary for generating random markdown content that could appear in manual sections.
 * Includes text, code blocks, headers, lists, and other markdown elements.
 */
const manualSectionContentArb = fc.oneof(
  // Plain text content
  fc.string({ minLength: 1, maxLength: 200 }).filter(s => 
    !s.includes(MANUAL_SECTION_START) && 
    !s.includes(MANUAL_SECTION_END)
  ),
  // Code block content
  fc.tuple(
    fc.constantFrom("typescript", "javascript", "python", "go", ""),
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
      !s.includes("```") && 
      !s.includes(MANUAL_SECTION_START) && 
      !s.includes(MANUAL_SECTION_END)
    )
  ).map(([lang, code]) => `\`\`\`${lang}\n${code}\n\`\`\``),
  // Markdown list content
  fc.array(
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
      !s.includes(MANUAL_SECTION_START) && 
      !s.includes(MANUAL_SECTION_END)
    ),
    { minLength: 1, maxLength: 5 }
  ).map(items => items.map(item => `- ${item}`).join("\n")),
  // Markdown header with text
  fc.tuple(
    fc.integer({ min: 2, max: 4 }),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
      !s.includes(MANUAL_SECTION_START) && 
      !s.includes(MANUAL_SECTION_END)
    ),
    fc.string({ minLength: 0, maxLength: 100 }).filter(s => 
      !s.includes(MANUAL_SECTION_START) && 
      !s.includes(MANUAL_SECTION_END)
    )
  ).map(([level, title, text]) => `${"#".repeat(level)} ${title}\n\n${text}`)
);

/**
 * Arbitrary for generating a complete manual section with markers and content.
 */
const manualSectionArb = manualSectionContentArb.map(content => ({
  content,
  fullSection: `${MANUAL_SECTION_START}${content}${MANUAL_SECTION_END}`
}));

/**
 * Arbitrary for generating documentation content outside of manual sections.
 * This represents auto-generated content that can change between regenerations.
 */
const generatedContentArb = fc.tuple(
  symbolNameArb,
  fc.string({ minLength: 10, maxLength: 200 }).filter(s => 
    !s.includes(MANUAL_SECTION_START) && 
    !s.includes(MANUAL_SECTION_END)
  )
).map(([name, description]) => `# ${name}

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/${name}.ts#${name} -->

## Purpose

${description}

**Source**
- \`src/${name}.ts\`
`);

/**
 * Arbitrary for generating existing documentation with manual sections.
 * Creates a document with 0-5 manual sections at various positions.
 */
const existingDocWithManualSectionsArb = fc.tuple(
  generatedContentArb,
  fc.array(manualSectionArb, { minLength: 0, maxLength: 5 })
).map(([baseContent, manualSections]) => {
  if (manualSections.length === 0) {
    return {
      content: baseContent,
      manualSections: []
    };
  }
  
  // Insert manual sections at the end of the document
  let content = baseContent.trimEnd();
  for (const section of manualSections) {
    content += "\n\n" + section.fullSection;
  }
  content += "\n";
  
  return {
    content,
    manualSections: manualSections.map(s => s.content)
  };
});

/**
 * Arbitrary for generating new documentation (regenerated content).
 * Can optionally include empty manual section placeholders.
 */
const newDocArb = (includeManualPlaceholders: boolean, placeholderCount: number) => 
  generatedContentArb.map(baseContent => {
    if (!includeManualPlaceholders || placeholderCount === 0) {
      return baseContent;
    }
    
    // Add empty manual section placeholders
    let content = baseContent.trimEnd();
    for (let i = 0; i < placeholderCount; i++) {
      content += `\n\n${MANUAL_SECTION_START}\n${MANUAL_SECTION_END}`;
    }
    content += "\n";
    
    return content;
  });

describe("Feature: documentation-tools, Property 15: Manual Section Preservation", () => {
  /**
   * Property 15.1: Manual section content is preserved exactly
   *
   * For any existing documentation with manual sections, regenerating the documentation
   * SHALL preserve the content within those sections unchanged.
   *
   * **Validates: Requirement 4.5**
   */
  it("should preserve manual section content exactly during regeneration", () => {
    fc.assert(
      fc.property(
        existingDocWithManualSectionsArb,
        generatedContentArb,
        ({ content: existingDoc, manualSections }, newDocBase) => {
          // Skip if no manual sections to preserve
          if (manualSections.length === 0) {
            return true;
          }
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // Each manual section content should be preserved exactly
          for (const sectionContent of manualSections) {
            expect(result).toContain(sectionContent);
          }
          
          // The manual section markers should be present
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(manualSections.length);
          
          // Content should match exactly
          for (let i = 0; i < manualSections.length; i++) {
            expect(extractedSections[i]?.content).toBe(manualSections[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.2: Content outside manual sections comes from new document
   *
   * For any regeneration, the content outside manual sections SHALL come from
   * the new document, not the existing document.
   *
   * **Validates: Requirement 4.5**
   */
  it("should use new document content outside manual sections", () => {
    fc.assert(
      fc.property(
        existingDocWithManualSectionsArb,
        generatedContentArb,
        ({ content: existingDoc, manualSections }, newDocBase) => {
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // The new document's base content should be present
          // Extract the title from the new document
          const newDocTitle = newDocBase.split("\n")[0];
          if (newDocTitle) {
            expect(result).toContain(newDocTitle);
          }
          
          // The archon:generated marker from new doc should be present
          expect(result).toContain("<!-- archon:generated -->");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.3: Multiple manual sections are all preserved
   *
   * For any existing documentation with multiple manual sections (1-5),
   * all manual sections SHALL be preserved during regeneration.
   *
   * **Validates: Requirement 4.5**
   */
  it("should preserve all manual sections when multiple exist", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(manualSectionContentArb, { minLength: 1, maxLength: 5 }),
        generatedContentArb,
        generatedContentArb,
        (sectionCount, contents, existingBase, newDocBase) => {
          // Use only the requested number of sections
          const actualContents = contents.slice(0, sectionCount);
          
          // Build existing doc with manual sections
          let existingDoc = existingBase.trimEnd();
          for (const content of actualContents) {
            existingDoc += `\n\n${MANUAL_SECTION_START}${content}${MANUAL_SECTION_END}`;
          }
          existingDoc += "\n";
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // All manual sections should be preserved
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(actualContents.length);
          
          // Each section content should match
          for (let i = 0; i < actualContents.length; i++) {
            expect(extractedSections[i]?.content).toBe(actualContents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.4: Order of manual sections is maintained
   *
   * For any existing documentation with multiple manual sections,
   * the order of manual sections SHALL be maintained during regeneration.
   *
   * **Validates: Requirement 4.5**
   */
  it("should maintain order of manual sections during regeneration", () => {
    fc.assert(
      fc.property(
        fc.array(manualSectionContentArb, { minLength: 2, maxLength: 5 }),
        generatedContentArb,
        generatedContentArb,
        (contents, existingBase, newDocBase) => {
          // Build existing doc with manual sections in specific order
          let existingDoc = existingBase.trimEnd();
          for (const content of contents) {
            existingDoc += `\n\n${MANUAL_SECTION_START}${content}${MANUAL_SECTION_END}`;
          }
          existingDoc += "\n";
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // Extract sections and verify order
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(contents.length);
          
          // Sections should be in the same order - compare extracted content with original
          for (let i = 0; i < contents.length; i++) {
            expect(extractedSections[i]?.content).toBe(contents[i]);
          }
          
          // Verify order by checking that extracted sections appear in sequence
          // Use the full section markers to avoid issues with duplicate content
          let lastPosition = -1;
          for (const section of extractedSections) {
            const position = result.indexOf(section.fullMatch, lastPosition + 1);
            expect(position).toBeGreaterThan(lastPosition);
            lastPosition = position;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.5: Empty existing document returns new document unchanged
   *
   * For any existing documentation without manual sections,
   * the new document SHALL be returned unchanged.
   *
   * **Validates: Requirement 4.5**
   */
  it("should return new document unchanged when no manual sections exist", () => {
    fc.assert(
      fc.property(
        generatedContentArb,
        generatedContentArb,
        (existingDoc, newDoc) => {
          // Ensure existing doc has no manual sections
          expect(existingDoc).not.toContain(MANUAL_SECTION_START);
          
          const result = preserveManualSections(existingDoc, newDoc);
          
          // Result should be the new document unchanged
          expect(result).toBe(newDoc);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.6: Manual sections with various content types are preserved
   *
   * For any manual section containing text, code blocks, or markdown elements,
   * the content SHALL be preserved exactly during regeneration.
   *
   * **Validates: Requirement 4.5**
   */
  it("should preserve manual sections with various content types", () => {
    fc.assert(
      fc.property(
        manualSectionContentArb,
        generatedContentArb,
        generatedContentArb,
        (manualContent, existingBase, newDocBase) => {
          // Build existing doc with the manual section
          const existingDoc = `${existingBase.trimEnd()}\n\n${MANUAL_SECTION_START}${manualContent}${MANUAL_SECTION_END}\n`;
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // The manual content should be preserved exactly
          expect(result).toContain(manualContent);
          
          // Extract and verify
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(1);
          expect(extractedSections[0]?.content).toBe(manualContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.7: Manual sections are appended when new doc has no placeholders
   *
   * When the new document doesn't have manual section placeholders,
   * the existing manual sections SHALL be appended to the end.
   *
   * **Validates: Requirement 4.5**
   */
  it("should append manual sections when new doc has no placeholders", () => {
    fc.assert(
      fc.property(
        fc.array(manualSectionContentArb, { minLength: 1, maxLength: 3 }),
        generatedContentArb,
        generatedContentArb,
        (contents, existingBase, newDocBase) => {
          // Build existing doc with manual sections
          let existingDoc = existingBase.trimEnd();
          for (const content of contents) {
            existingDoc += `\n\n${MANUAL_SECTION_START}${content}${MANUAL_SECTION_END}`;
          }
          existingDoc += "\n";
          
          // New doc has no manual section placeholders
          expect(newDocBase).not.toContain(MANUAL_SECTION_START);
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // All manual sections should be present
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(contents.length);
          
          // Each section content should be preserved
          for (let i = 0; i < contents.length; i++) {
            expect(extractedSections[i]?.content).toBe(contents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.8: Manual section content with newlines is preserved
   *
   * For any manual section containing newlines and multi-line content,
   * the content SHALL be preserved exactly including all newlines.
   *
   * **Validates: Requirement 4.5**
   */
  it("should preserve manual section content with newlines", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
            !s.includes(MANUAL_SECTION_START) && 
            !s.includes(MANUAL_SECTION_END)
          ),
          { minLength: 2, maxLength: 5 }
        ),
        generatedContentArb,
        generatedContentArb,
        (lines, existingBase, newDocBase) => {
          // Create multi-line content
          const multiLineContent = lines.join("\n");
          
          // Build existing doc with the manual section
          const existingDoc = `${existingBase.trimEnd()}\n\n${MANUAL_SECTION_START}${multiLineContent}${MANUAL_SECTION_END}\n`;
          
          const result = preserveManualSections(existingDoc, newDocBase);
          
          // The multi-line content should be preserved exactly
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(1);
          expect(extractedSections[0]?.content).toBe(multiLineContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.9: Manual sections replace placeholders in new doc when present
   *
   * When the new document has manual section placeholders,
   * the existing manual section content SHALL replace the placeholder content.
   *
   * **Validates: Requirement 4.5**
   */
  it("should replace placeholders in new doc with existing manual section content", () => {
    fc.assert(
      fc.property(
        fc.array(manualSectionContentArb, { minLength: 1, maxLength: 3 }),
        generatedContentArb,
        generatedContentArb,
        (contents, existingBase, newDocBase) => {
          // Build existing doc with manual sections
          let existingDoc = existingBase.trimEnd();
          for (const content of contents) {
            existingDoc += `\n\n${MANUAL_SECTION_START}${content}${MANUAL_SECTION_END}`;
          }
          existingDoc += "\n";
          
          // Build new doc with empty placeholders
          let newDoc = newDocBase.trimEnd();
          for (let i = 0; i < contents.length; i++) {
            newDoc += `\n\n${MANUAL_SECTION_START}\n${MANUAL_SECTION_END}`;
          }
          newDoc += "\n";
          
          const result = preserveManualSections(existingDoc, newDoc);
          
          // All manual sections should have the existing content
          const extractedSections = extractManualSections(result);
          expect(extractedSections.length).toBe(contents.length);
          
          for (let i = 0; i < contents.length; i++) {
            expect(extractedSections[i]?.content).toBe(contents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.10: Idempotent preservation - preserving twice yields same result
   *
   * For any documentation, preserving manual sections twice with the same
   * new document SHALL yield the same result as preserving once.
   *
   * **Validates: Requirement 4.5**
   */
  it("should be idempotent - preserving twice yields same result", () => {
    fc.assert(
      fc.property(
        existingDocWithManualSectionsArb,
        generatedContentArb,
        ({ content: existingDoc }, newDocBase) => {
          const result1 = preserveManualSections(existingDoc, newDocBase);
          const result2 = preserveManualSections(result1, newDocBase);
          
          // The results should be identical
          expect(result2).toBe(result1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 16: Documentation Change Detection
// ============================================================================

import { needsRegeneration, extractIndexHash } from "../../src/lib/doc_generator.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Arbitrary for generating valid SHA-256 hash strings.
 * SHA-256 hashes are 64 hexadecimal characters.
 */
const sha256HashArb = fc.stringOf(
  fc.constantFrom(..."0123456789abcdef".split("")),
  { minLength: 64, maxLength: 64 }
);

/**
 * Arbitrary for generating valid file names for temporary documentation files.
 */
const docFileNameArb = fc
  .stringOf(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
        ""
      )
    ),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => s.length > 0 && /^[a-zA-Z_]/.test(s))
  .map((name) => `${name}.archon.md`);

/**
 * Index hash marker constants (matching the implementation)
 */
const INDEX_HASH_MARKER_PREFIX = "<!-- index-hash: ";
const INDEX_HASH_MARKER_SUFFIX = " -->";

/**
 * Generate documentation content with an embedded index hash marker.
 *
 * @param hash - The hash to embed in the documentation
 * @param symbolName - The symbol name for the documentation
 * @returns Documentation content with the hash marker
 */
function generateDocContentWithHash(hash: string, symbolName: string): string {
  return `# ${symbolName}

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/${symbolName}.ts#${symbolName} -->
${INDEX_HASH_MARKER_PREFIX}${hash}${INDEX_HASH_MARKER_SUFFIX}

## Purpose

This function is defined in \`src/${symbolName}.ts\` at line 1.

**Source**
- \`src/${symbolName}.ts\`
`;
}

/**
 * Generate documentation content without an index hash marker.
 *
 * @param symbolName - The symbol name for the documentation
 * @returns Documentation content without a hash marker
 */
function generateDocContentWithoutHash(symbolName: string): string {
  return `# ${symbolName}

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/${symbolName}.ts#${symbolName} -->

## Purpose

This function is defined in \`src/${symbolName}.ts\` at line 1.

**Source**
- \`src/${symbolName}.ts\`
`;
}

describe("Feature: documentation-tools, Property 16: Documentation Change Detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "archon-pbt-"));
  });

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 16.1: extractIndexHash correctly extracts hash from documentation
   *
   * For any documentation content with a valid index hash marker,
   * extractIndexHash SHALL return the exact hash value.
   *
   * **Validates: Requirement 4.6**
   */
  it("should extract index hash from documentation content", () => {
    fc.assert(
      fc.property(sha256HashArb, symbolNameArb, (hash, symbolName) => {
        const content = generateDocContentWithHash(hash, symbolName);

        const extractedHash = extractIndexHash(content);

        // The extracted hash should match the original hash exactly
        expect(extractedHash).toBe(hash);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.2: extractIndexHash returns null for content without hash marker
   *
   * For any documentation content without an index hash marker,
   * extractIndexHash SHALL return null.
   *
   * **Validates: Requirement 4.6**
   */
  it("should return null when no index hash marker exists", () => {
    fc.assert(
      fc.property(symbolNameArb, (symbolName) => {
        const content = generateDocContentWithoutHash(symbolName);

        const extractedHash = extractIndexHash(content);

        // Should return null when no hash marker exists
        expect(extractedHash).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.3: needsRegeneration returns false when hashes match
   *
   * For any documentation file with a stored hash that matches the current index hash,
   * needsRegeneration SHALL return false (no regeneration needed).
   *
   * **Validates: Requirement 4.6**
   */
  it("should return false when stored hash matches current hash", async () => {
    await fc.assert(
      fc.asyncProperty(
        sha256HashArb,
        symbolNameArb,
        docFileNameArb,
        async (hash, symbolName, fileName) => {
          // Create a documentation file with the hash
          const docPath = path.join(tempDir, fileName);
          const content = generateDocContentWithHash(hash, symbolName);
          await fs.writeFile(docPath, content, "utf-8");

          // Check if regeneration is needed with the same hash
          const result = await needsRegeneration(docPath, hash);

          // Should return false - no regeneration needed when hashes match
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.4: needsRegeneration returns true when hashes differ
   *
   * For any documentation file with a stored hash that differs from the current index hash,
   * needsRegeneration SHALL return true (regeneration needed).
   *
   * **Validates: Requirement 4.6**
   */
  it("should return true when stored hash differs from current hash", async () => {
    await fc.assert(
      fc.asyncProperty(
        sha256HashArb,
        sha256HashArb,
        symbolNameArb,
        docFileNameArb,
        async (storedHash, currentHash, symbolName, fileName) => {
          // Skip if hashes happen to be the same
          fc.pre(storedHash !== currentHash);

          // Create a documentation file with the stored hash
          const docPath = path.join(tempDir, fileName);
          const content = generateDocContentWithHash(storedHash, symbolName);
          await fs.writeFile(docPath, content, "utf-8");

          // Check if regeneration is needed with a different hash
          const result = await needsRegeneration(docPath, currentHash);

          // Should return true - regeneration needed when hashes differ
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.5: needsRegeneration returns true when no stored hash exists
   *
   * For any documentation file without a stored index hash,
   * needsRegeneration SHALL return true (regeneration needed).
   *
   * **Validates: Requirement 4.6**
   */
  it("should return true when no stored hash exists in documentation", async () => {
    await fc.assert(
      fc.asyncProperty(
        sha256HashArb,
        symbolNameArb,
        docFileNameArb,
        async (currentHash, symbolName, fileName) => {
          // Create a documentation file without a hash marker
          const docPath = path.join(tempDir, fileName);
          const content = generateDocContentWithoutHash(symbolName);
          await fs.writeFile(docPath, content, "utf-8");

          // Check if regeneration is needed
          const result = await needsRegeneration(docPath, currentHash);

          // Should return true - regeneration needed when no stored hash
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.6: needsRegeneration returns true when file doesn't exist
   *
   * For any non-existent documentation file path,
   * needsRegeneration SHALL return true (regeneration needed).
   *
   * **Validates: Requirement 4.6**
   */
  it("should return true when documentation file does not exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        sha256HashArb,
        docFileNameArb,
        async (currentHash, fileName) => {
          // Use a path that doesn't exist
          const docPath = path.join(tempDir, "nonexistent", fileName);

          // Check if regeneration is needed
          const result = await needsRegeneration(docPath, currentHash);

          // Should return true - regeneration needed when file doesn't exist
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.7: extractIndexHash handles various hash positions in content
   *
   * For any documentation content with the hash marker at various positions,
   * extractIndexHash SHALL correctly extract the hash regardless of position.
   *
   * **Validates: Requirement 4.6**
   */
  it("should extract hash regardless of position in content", () => {
    fc.assert(
      fc.property(
        sha256HashArb,
        fc.string({ minLength: 0, maxLength: 100 }).filter(
          (s) =>
            !s.includes(INDEX_HASH_MARKER_PREFIX) &&
            !s.includes(INDEX_HASH_MARKER_SUFFIX)
        ),
        fc.string({ minLength: 0, maxLength: 100 }).filter(
          (s) =>
            !s.includes(INDEX_HASH_MARKER_PREFIX) &&
            !s.includes(INDEX_HASH_MARKER_SUFFIX)
        ),
        (hash, prefix, suffix) => {
          // Create content with hash marker at various positions
          const content = `${prefix}${INDEX_HASH_MARKER_PREFIX}${hash}${INDEX_HASH_MARKER_SUFFIX}${suffix}`;

          const extractedHash = extractIndexHash(content);

          // Should extract the hash correctly
          expect(extractedHash).toBe(hash);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.8: extractIndexHash returns null for malformed hash markers
   *
   * For any content with incomplete or malformed hash markers,
   * extractIndexHash SHALL return null.
   *
   * **Validates: Requirement 4.6**
   */
  it("should return null for malformed hash markers", () => {
    fc.assert(
      fc.property(
        sha256HashArb,
        fc.constantFrom(
          // Missing end marker
          (hash: string) => `${INDEX_HASH_MARKER_PREFIX}${hash}`,
          // Missing start marker
          (hash: string) => `${hash}${INDEX_HASH_MARKER_SUFFIX}`,
          // Empty hash
          (_hash: string) => `${INDEX_HASH_MARKER_PREFIX}${INDEX_HASH_MARKER_SUFFIX}`,
          // Whitespace only hash
          (_hash: string) => `${INDEX_HASH_MARKER_PREFIX}   ${INDEX_HASH_MARKER_SUFFIX}`
        ),
        (hash, contentGenerator) => {
          const content = contentGenerator(hash);

          const extractedHash = extractIndexHash(content);

          // Should return null for malformed markers
          // Note: empty hash case returns null, whitespace-only returns null after trim
          if (content === `${INDEX_HASH_MARKER_PREFIX}${INDEX_HASH_MARKER_SUFFIX}`) {
            expect(extractedHash).toBeNull();
          } else if (content === `${INDEX_HASH_MARKER_PREFIX}   ${INDEX_HASH_MARKER_SUFFIX}`) {
            expect(extractedHash).toBeNull();
          } else {
            // Missing end or start marker
            expect(extractedHash).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.9: Change detection is deterministic
   *
   * For any documentation file and index hash, calling needsRegeneration
   * multiple times SHALL return the same result.
   *
   * **Validates: Requirement 4.6**
   */
  it("should be deterministic - same inputs yield same result", async () => {
    await fc.assert(
      fc.asyncProperty(
        sha256HashArb,
        sha256HashArb,
        symbolNameArb,
        docFileNameArb,
        async (storedHash, currentHash, symbolName, fileName) => {
          // Create a documentation file
          const docPath = path.join(tempDir, fileName);
          const content = generateDocContentWithHash(storedHash, symbolName);
          await fs.writeFile(docPath, content, "utf-8");

          // Call needsRegeneration multiple times
          const result1 = await needsRegeneration(docPath, currentHash);
          const result2 = await needsRegeneration(docPath, currentHash);
          const result3 = await needsRegeneration(docPath, currentHash);

          // All results should be identical
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.10: Hash extraction is case-sensitive
   *
   * For any SHA-256 hash (lowercase hex), the extraction SHALL preserve
   * the exact case of the stored hash.
   *
   * **Validates: Requirement 4.6**
   */
  it("should preserve exact case of stored hash", () => {
    fc.assert(
      fc.property(
        // Generate hashes with mixed case to test case sensitivity
        fc.stringOf(
          fc.constantFrom(..."0123456789abcdefABCDEF".split("")),
          { minLength: 64, maxLength: 64 }
        ),
        symbolNameArb,
        (hash, symbolName) => {
          const content = generateDocContentWithHash(hash, symbolName);

          const extractedHash = extractIndexHash(content);

          // The extracted hash should preserve exact case
          expect(extractedHash).toBe(hash);
        }
      ),
      { numRuns: 100 }
    );
  });
});
