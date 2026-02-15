/**
 * SCIP Index Parser
 *
 * Parses SCIP index files and extracts symbol information, relationships,
 * and documentation for use in documentation generation.
 *
 * SCIP (Source Code Intelligence Protocol) is a language-agnostic protocol
 * for indexing source code. This parser reads binary Protocol Buffer encoded
 * .scip files and extracts symbols and their relationships.
 *
 * Error Handling Strategy:
 * - Recoverable errors (malformed symbols, missing fields) are collected and parsing continues
 * - Non-recoverable errors (corrupted protobuf, file read failures) stop parsing but return structured errors
 * - The parser never throws exceptions - all errors are returned in the result
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import protobuf from "protobufjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generate as generateArn } from "./arn.js";
/**
 * Error codes for categorizing SCIP parsing errors.
 * Used for programmatic error handling and diagnostics.
 */
export var ScipErrorCode;
(function (ScipErrorCode) {
    ScipErrorCode["FILE_READ_ERROR"] = "FILE_READ_ERROR";
    ScipErrorCode["PROTOBUF_DECODE_ERROR"] = "PROTOBUF_DECODE_ERROR";
    ScipErrorCode["INVALID_INDEX_STRUCTURE"] = "INVALID_INDEX_STRUCTURE";
    ScipErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    ScipErrorCode["INVALID_SYMBOL_FORMAT"] = "INVALID_SYMBOL_FORMAT";
    ScipErrorCode["INVALID_OCCURRENCE_RANGE"] = "INVALID_OCCURRENCE_RANGE";
    ScipErrorCode["DOCUMENT_PROCESSING_ERROR"] = "DOCUMENT_PROCESSING_ERROR";
    ScipErrorCode["RELATIONSHIP_EXTRACTION_ERROR"] = "RELATIONSHIP_EXTRACTION_ERROR";
})(ScipErrorCode || (ScipErrorCode = {}));
/**
 * Create a structured parse error with diagnostic information.
 *
 * @param code - Error code for categorization
 * @param message - Human-readable error message
 * @param recoverable - Whether parsing can continue after this error
 * @param options - Additional error context
 * @returns Structured error object
 */
function createParseError(code, message, recoverable, options) {
    const error = {
        message,
        recoverable,
        code,
    };
    if (options?.file !== undefined) {
        error.file = options.file;
    }
    if (options?.line !== undefined) {
        error.line = options.line;
    }
    if (options?.context !== undefined) {
        error.context = options.context;
    }
    return error;
}
// Get the directory of this module for loading the proto file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROTO_PATH = join(__dirname, "..", "proto", "scip.proto");
// Symbol role bit flags from SCIP protocol
const SymbolRole = {
    Definition: 0x1,
    Import: 0x2,
    WriteAccess: 0x4,
    ReadAccess: 0x8,
    Generated: 0x10,
    Test: 0x20,
    ForwardDefinition: 0x40,
};
// SCIP Kind enum to our SymbolKind mapping
const SCIP_KIND_MAP = {
    7: "class", // Class
    9: "function", // Constructor
    11: "type", // Enum
    15: "variable", // Field
    17: "function", // Function
    21: "type", // Interface
    27: "method", // Method
    28: "module", // Module
    29: "module", // Namespace
    34: "module", // Package
    39: "variable", // Property
    46: "type", // Struct
    51: "type", // Trait
    52: "type", // TypeAlias
    56: "type", // Type
    59: "variable", // Variable
};
// Cached protobuf root
let cachedRoot = null;
/**
 * Load and cache the protobuf schema
 */
async function loadProtoSchema() {
    if (cachedRoot) {
        return cachedRoot;
    }
    cachedRoot = await protobuf.load(PROTO_PATH);
    return cachedRoot;
}
/**
 * Validate that a SCIP index has the expected structure.
 * Returns errors for any structural issues found.
 *
 * @param index - The decoded SCIP index object
 * @returns Array of validation errors (empty if valid)
 */
function validateIndexStructure(index) {
    const errors = [];
    if (!index || typeof index !== "object") {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, "SCIP index is null or not an object", false, { context: { receivedType: typeof index } }));
        return errors;
    }
    const indexObj = index;
    // Check for documents array (required for meaningful parsing)
    if (indexObj["documents"] !== undefined && !Array.isArray(indexObj["documents"])) {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, "SCIP index 'documents' field is not an array", true, { context: { receivedType: typeof indexObj["documents"] } }));
    }
    // Check for external symbols array if present
    if (indexObj["externalSymbols"] !== undefined &&
        !Array.isArray(indexObj["externalSymbols"])) {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, "SCIP index 'externalSymbols' field is not an array", true, { context: { receivedType: typeof indexObj["externalSymbols"] } }));
    }
    return errors;
}
/**
 * Validate a SCIP document structure.
 * Returns errors for any issues found.
 *
 * @param doc - The SCIP document to validate
 * @param docIndex - Index of the document for error reporting
 * @returns Array of validation errors (empty if valid)
 */
function validateDocument(doc, docIndex) {
    const errors = [];
    if (!doc || typeof doc !== "object") {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, `Document at index ${docIndex} is null or not an object`, true, { context: { docIndex, receivedType: typeof doc } }));
        return errors;
    }
    const docObj = doc;
    // relativePath should be a string if present
    if (docObj["relativePath"] !== undefined &&
        typeof docObj["relativePath"] !== "string") {
        errors.push(createParseError(ScipErrorCode.MISSING_REQUIRED_FIELD, `Document at index ${docIndex} has invalid 'relativePath' field`, true, {
            context: {
                docIndex,
                receivedType: typeof docObj["relativePath"],
            },
        }));
    }
    // occurrences should be an array if present
    if (docObj["occurrences"] !== undefined &&
        !Array.isArray(docObj["occurrences"])) {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, `Document at index ${docIndex} has invalid 'occurrences' field`, true, {
            file: typeof docObj["relativePath"] === "string" ? docObj["relativePath"] : undefined,
            context: { docIndex, receivedType: typeof docObj["occurrences"] },
        }));
    }
    // symbols should be an array if present
    if (docObj["symbols"] !== undefined && !Array.isArray(docObj["symbols"])) {
        errors.push(createParseError(ScipErrorCode.INVALID_INDEX_STRUCTURE, `Document at index ${docIndex} has invalid 'symbols' field`, true, {
            file: typeof docObj["relativePath"] === "string" ? docObj["relativePath"] : undefined,
            context: { docIndex, receivedType: typeof docObj["symbols"] },
        }));
    }
    return errors;
}
/**
 * Validate a SCIP symbol string format.
 * SCIP symbols should follow specific patterns.
 *
 * @param symbol - The SCIP symbol string to validate
 * @param filePath - File path for error context
 * @returns Validation error if invalid, null if valid
 */
function validateSymbolFormat(symbol, filePath) {
    if (symbol === undefined || symbol === null) {
        return createParseError(ScipErrorCode.INVALID_SYMBOL_FORMAT, "Symbol is null or undefined", true, { file: filePath, context: { symbol } });
    }
    if (typeof symbol !== "string") {
        return createParseError(ScipErrorCode.INVALID_SYMBOL_FORMAT, `Symbol is not a string, received ${typeof symbol}`, true, { file: filePath, context: { receivedType: typeof symbol } });
    }
    // Empty symbols are technically valid but unusual
    if (symbol.length === 0) {
        return createParseError(ScipErrorCode.INVALID_SYMBOL_FORMAT, "Symbol is an empty string", true, { file: filePath });
    }
    return null;
}
/**
 * Validate an occurrence range array.
 * SCIP ranges should have 3 or 4 elements.
 *
 * @param range - The range array to validate
 * @param filePath - File path for error context
 * @param symbol - Symbol for error context
 * @returns Validation error if invalid, null if valid
 */
function validateOccurrenceRange(range, filePath, symbol) {
    if (!range) {
        return createParseError(ScipErrorCode.INVALID_OCCURRENCE_RANGE, "Occurrence range is null or undefined", true, { file: filePath, context: { symbol } });
    }
    if (!Array.isArray(range)) {
        return createParseError(ScipErrorCode.INVALID_OCCURRENCE_RANGE, `Occurrence range is not an array, received ${typeof range}`, true, { file: filePath, context: { symbol, receivedType: typeof range } });
    }
    if (range.length < 3) {
        return createParseError(ScipErrorCode.INVALID_OCCURRENCE_RANGE, `Occurrence range has insufficient elements (${range.length}, expected 3 or 4)`, true, { file: filePath, context: { symbol, rangeLength: range.length } });
    }
    // Validate that range elements are numbers
    for (let i = 0; i < range.length; i++) {
        if (typeof range[i] !== "number" || isNaN(range[i])) {
            return createParseError(ScipErrorCode.INVALID_OCCURRENCE_RANGE, `Occurrence range element at index ${i} is not a valid number`, true, {
                file: filePath,
                context: { symbol, elementIndex: i, elementValue: range[i] },
            });
        }
    }
    return null;
}
/**
 * Parse a SCIP symbol string to extract the symbol name.
 * SCIP symbols have a specific format like:
 * - scip-typescript npm package-name version path/to/file.ts SymbolName.
 * - local 42
 *
 * @param scipSymbol - The SCIP symbol string
 * @returns The extracted symbol name
 */
function parseScipSymbolName(scipSymbol) {
    if (!scipSymbol) {
        return "";
    }
    // Local symbols have format "local N"
    if (scipSymbol.startsWith("local ")) {
        return `local_${scipSymbol.slice(6)}`;
    }
    // Extract the last component which is typically the symbol name
    // SCIP symbols end with the symbol name followed by optional descriptor
    const parts = scipSymbol.split(" ");
    if (parts.length === 0) {
        return scipSymbol;
    }
    // The last part contains the symbol path
    const lastPart = parts[parts.length - 1];
    if (!lastPart) {
        return scipSymbol;
    }
    // Split by common delimiters and get the last meaningful segment
    const segments = lastPart.split(/[./`#]/);
    const lastSegment = segments.filter((s) => s && s !== "").pop();
    // Remove trailing punctuation like () or .
    // Handle cases like "getName()" -> "getName" and "getName()." -> "getName"
    if (lastSegment) {
        return lastSegment.replace(/\(\)\.?$/, "").replace(/[().]$/, "");
    }
    return lastPart;
}
/**
 * Map SCIP Kind enum value to our SymbolKind
 */
function mapScipKind(kind) {
    if (kind === undefined || kind === 0) {
        return "variable"; // Default to variable for unspecified
    }
    return SCIP_KIND_MAP[kind] || "variable";
}
/**
 * Extract file path from SCIP symbol string
 */
function extractFileFromSymbol(scipSymbol) {
    if (!scipSymbol || scipSymbol.startsWith("local ")) {
        return null;
    }
    // SCIP symbols contain file paths - try to extract them
    // Format varies by indexer but typically includes file extension
    const match = scipSymbol.match(/([^`\s]+\.(ts|js|go|py|java|rs|rb))/i);
    return match && match[1] ? match[1] : null;
}
/**
 * Parse occurrence range from SCIP format.
 * SCIP uses a compact range format:
 * - [line, startChar, endChar] for single-line ranges
 * - [startLine, startChar, endLine, endChar] for multi-line ranges
 */
function parseOccurrenceRange(range) {
    if (!range || range.length === 0) {
        return { file: "", line: 1, column: 0 };
    }
    if (range.length === 3) {
        // Single line: [line, startChar, endChar]
        const line = range[0] ?? 0;
        const column = range[1] ?? 0;
        return {
            file: "",
            line: line + 1, // Convert to 1-indexed
            column,
        };
    }
    if (range.length >= 4) {
        // Multi-line: [startLine, startChar, endLine, endChar]
        const line = range[0] ?? 0;
        const column = range[1] ?? 0;
        return {
            file: "",
            line: line + 1, // Convert to 1-indexed
            column,
        };
    }
    return { file: "", line: 1, column: 0 };
}
/**
 * Check if an occurrence is a definition based on symbol roles
 */
function isDefinition(symbolRoles) {
    return (symbolRoles & SymbolRole.Definition) !== 0;
}
/**
 * Check if an occurrence is an import
 */
function isImport(symbolRoles) {
    return (symbolRoles & SymbolRole.Import) !== 0;
}
/**
 * Extract relationships from SCIP data structures.
 *
 * Relationships are extracted from:
 * 1. SymbolInformation.relationships - explicit relationships
 * 2. SymbolInformation.enclosing_symbol - contains relationships
 * 3. Occurrence data - references relationships
 *
 * @param documents - Parsed SCIP documents
 * @param symbolMap - Map of SCIP symbol strings to our ScipSymbol objects
 * @param workspace - Workspace name for ARN generation
 * @param packageName - Package name for ARN generation
 * @returns Array of extracted relationships
 */
function extractRelationships(documents, symbolMap, workspace, packageName) {
    const relationships = [];
    const seenRelationships = new Set();
    /**
     * Add a relationship if it hasn't been seen before
     */
    function addRelationship(fromArn, toArn, type) {
        const key = `${fromArn}|${toArn}|${type}`;
        if (!seenRelationships.has(key) && fromArn !== toArn) {
            seenRelationships.add(key);
            relationships.push({ from: fromArn, to: toArn, type });
        }
    }
    for (const doc of documents) {
        const filePath = doc.relativePath || "";
        // Process symbol information for explicit relationships
        for (const symbolInfo of doc.symbols || []) {
            const fromSymbol = symbolMap.get(symbolInfo.symbol);
            if (!fromSymbol)
                continue;
            // Extract enclosing_symbol as "contains" relationship (parent contains child)
            if (symbolInfo.enclosingSymbol) {
                const parentSymbol = symbolMap.get(symbolInfo.enclosingSymbol);
                if (parentSymbol) {
                    // Parent contains this symbol
                    addRelationship(parentSymbol.arn, fromSymbol.arn, "contains");
                }
            }
            // Process explicit relationships from SymbolInformation
            for (const rel of symbolInfo.relationships || []) {
                const toSymbol = symbolMap.get(rel.symbol);
                const toArn = toSymbol
                    ? toSymbol.arn
                    : generateArnForScipSymbol(rel.symbol, workspace, packageName, "");
                if (rel.isImplementation) {
                    // This symbol implements the target
                    addRelationship(fromSymbol.arn, toArn, "implements");
                }
                if (rel.isTypeDefinition) {
                    // This symbol extends the target (type definition relationship)
                    addRelationship(fromSymbol.arn, toArn, "extends");
                }
                if (rel.isReference) {
                    // This symbol references the target
                    addRelationship(fromSymbol.arn, toArn, "references");
                }
            }
        }
        // Process occurrences for reference and import relationships
        for (const occ of doc.occurrences || []) {
            const targetSymbol = symbolMap.get(occ.symbol);
            if (!targetSymbol)
                continue;
            const symbolRoles = occ.symbolRoles || 0;
            // Import relationships
            if (isImport(symbolRoles)) {
                // Create a module ARN for the importing file
                const importerArn = generateArn({
                    type: "code",
                    workspace,
                    package: packageName,
                    path: filePath,
                    symbol: undefined,
                });
                addRelationship(importerArn, targetSymbol.arn, "imports");
            }
            // Reference relationships (non-definition occurrences)
            if (!isDefinition(symbolRoles) && !isImport(symbolRoles)) {
                // Find the enclosing symbol for this reference
                const enclosingOcc = findEnclosingDefinition(doc.occurrences || [], occ);
                if (enclosingOcc) {
                    const enclosingSymbol = symbolMap.get(enclosingOcc.symbol);
                    if (enclosingSymbol) {
                        addRelationship(enclosingSymbol.arn, targetSymbol.arn, "references");
                    }
                }
            }
        }
    }
    return relationships;
}
/**
 * Find the enclosing definition for an occurrence.
 * This helps establish which symbol is referencing another.
 */
function findEnclosingDefinition(occurrences, targetOcc) {
    if (!occurrences || !targetOcc.range || targetOcc.range.length < 3) {
        return null;
    }
    const targetLine = targetOcc.range[0];
    if (targetLine === undefined) {
        return null;
    }
    let bestMatch = null;
    let bestDistance = Infinity;
    for (const occ of occurrences) {
        if (!occ.range || occ.range.length < 3)
            continue;
        if (!isDefinition(occ.symbolRoles || 0))
            continue;
        if (occ.symbol === targetOcc.symbol)
            continue;
        const occLine = occ.range[0];
        if (occLine === undefined)
            continue;
        // Find the closest definition that comes before or at the same line
        if (occLine <= targetLine) {
            const distance = targetLine - occLine;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = occ;
            }
        }
    }
    return bestMatch;
}
/**
 * Generate an ARN for a SCIP symbol string
 */
function generateArnForScipSymbol(scipSymbol, workspace, packageName, filePath) {
    const symbolName = parseScipSymbolName(scipSymbol);
    const extractedFile = extractFileFromSymbol(scipSymbol);
    const path = extractedFile || filePath || "unknown";
    return generateArn({
        type: "code",
        workspace,
        package: packageName,
        path,
        symbol: symbolName || undefined,
    });
}
/**
 * Compute a hash for a single SCIP document's content.
 * Used for per-file change detection in incremental parsing.
 */
function computeDocumentHash(doc) {
    const content = JSON.stringify({
        relativePath: doc.relativePath,
        symbols: doc.symbols,
        occurrences: doc.occurrences,
    });
    return createHash("sha256").update(content).digest("hex");
}
/**
 * Process a single SCIP document and extract symbols.
 * Returns the symbols and updates the symbol map.
 * Collects errors for malformed data but continues processing valid portions.
 *
 * @param doc - The SCIP document to process
 * @param workspace - Workspace name for ARN generation
 * @param packageName - Package name for ARN generation
 * @param symbolMap - Map to populate with symbols
 * @param errors - Array to collect errors into
 * @returns Array of extracted symbols
 */
function processDocument(doc, workspace, packageName, symbolMap, errors) {
    const symbols = [];
    const filePath = doc.relativePath || "";
    // Process symbol definitions from SymbolInformation
    for (const symbolInfo of doc.symbols || []) {
        // Validate symbol format
        const symbolError = validateSymbolFormat(symbolInfo.symbol, filePath);
        if (symbolError) {
            errors.push(symbolError);
            // Skip this symbol but continue processing others
            continue;
        }
        try {
            const symbolName = parseScipSymbolName(symbolInfo.symbol);
            const kind = mapScipKind(symbolInfo.kind);
            // Build signature from documentation or display name
            let signature = symbolInfo.displayName || symbolName;
            if (symbolInfo.signatureDocumentation?.text) {
                signature = symbolInfo.signatureDocumentation.text;
            }
            // Find the definition occurrence for location
            const defOcc = (doc.occurrences || []).find((occ) => occ.symbol === symbolInfo.symbol &&
                isDefinition(occ.symbolRoles || 0));
            let location;
            if (defOcc) {
                // Validate the occurrence range
                const rangeError = validateOccurrenceRange(defOcc.range, filePath, symbolInfo.symbol);
                if (rangeError) {
                    errors.push(rangeError);
                    // Use default location but continue processing
                    location = { file: filePath, line: 1, column: 0 };
                }
                else {
                    location = { ...parseOccurrenceRange(defOcc.range), file: filePath };
                }
            }
            else {
                location = { file: filePath, line: 1, column: 0 };
            }
            const arn = generateArn({
                type: "code",
                workspace,
                package: packageName,
                path: filePath,
                symbol: symbolName || undefined,
            });
            const symbol = {
                name: symbolName,
                kind,
                signature,
                documentation: symbolInfo.documentation?.join("\n"),
                location,
                arn,
            };
            symbols.push(symbol);
            symbolMap.set(symbolInfo.symbol, symbol);
        }
        catch (error) {
            // Catch any unexpected errors during symbol processing
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Error processing symbol '${symbolInfo.symbol}': ${errorMessage}`, true, { file: filePath, context: { symbol: symbolInfo.symbol } }));
        }
    }
    // Also process definition occurrences that might not have SymbolInformation
    for (const occ of doc.occurrences || []) {
        if (!isDefinition(occ.symbolRoles || 0))
            continue;
        if (symbolMap.has(occ.symbol))
            continue;
        // Validate symbol format
        const symbolError = validateSymbolFormat(occ.symbol, filePath);
        if (symbolError) {
            errors.push(symbolError);
            continue;
        }
        // Validate occurrence range
        const rangeError = validateOccurrenceRange(occ.range, filePath, occ.symbol);
        if (rangeError) {
            errors.push(rangeError);
            // Continue with default location
        }
        try {
            const symbolName = parseScipSymbolName(occ.symbol);
            const location = rangeError
                ? { file: filePath, line: 1, column: 0 }
                : { ...parseOccurrenceRange(occ.range), file: filePath };
            const arn = generateArn({
                type: "code",
                workspace,
                package: packageName,
                path: filePath,
                symbol: symbolName || undefined,
            });
            const symbol = {
                name: symbolName,
                kind: "variable", // Default kind for occurrences without SymbolInformation
                signature: symbolName,
                location,
                arn,
            };
            symbols.push(symbol);
            symbolMap.set(occ.symbol, symbol);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Error processing occurrence '${occ.symbol}': ${errorMessage}`, true, { file: filePath, context: { symbol: occ.symbol } }));
        }
    }
    return symbols;
}
/**
 * Parse SCIP index file and extract symbols with ARNs.
 * Computes hash for change detection.
 *
 * Error Handling:
 * - File read errors: Non-recoverable, returns empty result with error
 * - Protobuf decode errors: Non-recoverable, returns empty result with error
 * - Invalid index structure: Recoverable if documents array exists
 * - Malformed symbols/occurrences: Recoverable, skipped with error logged
 *
 * @param indexPath - Path to the SCIP index file
 * @param workspace - Workspace name for ARN generation
 * @param packageName - Package name for ARN generation
 * @returns Parsed result with symbols, relationships, hash, and any errors
 */
export async function parse(indexPath, workspace, packageName) {
    const errors = [];
    // Step 1: Read the binary SCIP index file
    let indexBuffer;
    try {
        indexBuffer = await readFile(indexPath);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof Error && "code" in error
            ? error.code
            : undefined;
        errors.push(createParseError(ScipErrorCode.FILE_READ_ERROR, `Failed to read SCIP index file: ${errorMessage}`, false, {
            file: indexPath,
            context: { errorCode, path: indexPath },
        }));
        return {
            symbols: [],
            relationships: [],
            hash: "",
            errors,
        };
    }
    // Step 2: Compute overall hash for change detection
    const hash = createHash("sha256").update(indexBuffer).digest("hex");
    // Step 3: Load protobuf schema
    let root;
    try {
        root = await loadProtoSchema();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.PROTOBUF_DECODE_ERROR, `Failed to load protobuf schema: ${errorMessage}`, false, { context: { protoPath: PROTO_PATH } }));
        return {
            symbols: [],
            relationships: [],
            hash,
            errors,
        };
    }
    // Step 4: Decode the protobuf message
    let index;
    try {
        const IndexType = root.lookupType("scip.Index");
        const indexMessage = IndexType.decode(indexBuffer);
        index = IndexType.toObject(indexMessage, {
            longs: Number,
            enums: Number,
            defaults: true,
            arrays: true,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Provide detailed diagnostics for protobuf decode errors
        let diagnosticMessage = `Failed to decode SCIP index: ${errorMessage}`;
        if (errorMessage.includes("invalid wire type")) {
            diagnosticMessage +=
                ". This may indicate a corrupted file or incompatible SCIP version.";
        }
        else if (errorMessage.includes("index out of range")) {
            diagnosticMessage +=
                ". This may indicate a truncated or incomplete SCIP file.";
        }
        errors.push(createParseError(ScipErrorCode.PROTOBUF_DECODE_ERROR, diagnosticMessage, false, {
            file: indexPath,
            context: {
                bufferSize: indexBuffer.length,
                originalError: errorMessage,
            },
        }));
        return {
            symbols: [],
            relationships: [],
            hash,
            errors,
        };
    }
    // Step 5: Validate index structure
    const structureErrors = validateIndexStructure(index);
    errors.push(...structureErrors);
    // If we have non-recoverable structure errors, return early
    const hasNonRecoverableStructureError = structureErrors.some((e) => !e.recoverable);
    if (hasNonRecoverableStructureError) {
        return {
            symbols: [],
            relationships: [],
            hash,
            errors,
        };
    }
    // Step 6: Process documents and extract symbols
    const symbolMap = new Map();
    const symbols = [];
    const fileHashes = {};
    const documents = Array.isArray(index.documents) ? index.documents : [];
    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
        const doc = documents[docIndex];
        // Validate document structure
        const docErrors = validateDocument(doc, docIndex);
        errors.push(...docErrors);
        // Skip documents with non-recoverable errors
        const hasNonRecoverableDocError = docErrors.some((e) => !e.recoverable);
        if (hasNonRecoverableDocError) {
            continue;
        }
        // Skip if doc is not a valid object
        if (!doc || typeof doc !== "object") {
            continue;
        }
        const filePath = doc.relativePath || "";
        // Compute per-file hash for incremental parsing
        try {
            fileHashes[filePath] = computeDocumentHash(doc);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Failed to compute hash for document: ${errorMessage}`, true, { file: filePath, context: { docIndex } }));
        }
        // Process the document and extract symbols
        const docSymbols = processDocument(doc, workspace, packageName, symbolMap, errors);
        symbols.push(...docSymbols);
    }
    // Step 7: Process external symbols
    const externalSymbols = Array.isArray(index.externalSymbols)
        ? index.externalSymbols
        : [];
    for (const extSymbol of externalSymbols) {
        if (!extSymbol || symbolMap.has(extSymbol.symbol))
            continue;
        // Validate symbol format
        const symbolError = validateSymbolFormat(extSymbol.symbol, "external");
        if (symbolError) {
            errors.push(symbolError);
            continue;
        }
        try {
            const symbolName = parseScipSymbolName(extSymbol.symbol);
            const kind = mapScipKind(extSymbol.kind);
            const extractedFile = extractFileFromSymbol(extSymbol.symbol);
            const arn = generateArn({
                type: "code",
                workspace,
                package: packageName,
                path: extractedFile || "external",
                symbol: symbolName || undefined,
            });
            const symbol = {
                name: symbolName,
                kind,
                signature: extSymbol.displayName || symbolName,
                documentation: extSymbol.documentation?.join("\n"),
                location: { file: extractedFile || "external", line: 1, column: 0 },
                arn,
            };
            symbolMap.set(extSymbol.symbol, symbol);
            // Don't add external symbols to the main symbols array
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Error processing external symbol '${extSymbol.symbol}': ${errorMessage}`, true, { context: { symbol: extSymbol.symbol } }));
        }
    }
    // Step 8: Extract relationships
    let relationships = [];
    try {
        relationships = extractRelationships(documents, symbolMap, workspace, packageName);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.RELATIONSHIP_EXTRACTION_ERROR, `Failed to extract relationships: ${errorMessage}`, true, { context: { symbolCount: symbols.length } }));
    }
    return {
        symbols,
        relationships,
        hash,
        fileHashes,
        errors: errors.length > 0 ? errors : undefined,
    };
}
/**
 * Check if index has changed by comparing hashes.
 *
 * @param indexPath - Path to the SCIP index file
 * @param storedHash - Previously stored hash to compare against
 * @returns True if the index has changed
 */
export async function hasChanged(indexPath, storedHash) {
    try {
        const indexBuffer = await readFile(indexPath);
        const currentHash = createHash("sha256").update(indexBuffer).digest("hex");
        return currentHash !== storedHash;
    }
    catch {
        // If we can't read the file, consider it changed
        return true;
    }
}
/**
 * Parse incrementally, only processing changed files.
 * Preserves previously parsed data for unchanged files.
 *
 * This function implements true incremental parsing by:
 * 1. Checking if the overall index has changed
 * 2. If unchanged, returning the previous result immediately
 * 3. If changed, comparing per-file hashes to identify changed files
 * 4. Only re-processing changed files
 * 5. Preserving symbols and relationships from unchanged files
 * 6. Merging new data with preserved data
 *
 * Error Handling:
 * - Falls back to full parse on non-recoverable errors
 * - Collects recoverable errors and continues processing
 * - Never throws exceptions
 *
 * @param indexPath - Path to the SCIP index file
 * @param workspace - Workspace name for ARN generation
 * @param packageName - Package name for ARN generation
 * @param previousResult - Previous parse result to merge with
 * @returns Updated parse result with merged data
 */
export async function parseIncremental(indexPath, workspace, packageName, previousResult) {
    const errors = [];
    // Check if the overall index has changed
    let changed;
    try {
        changed = await hasChanged(indexPath, previousResult.hash);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.FILE_READ_ERROR, `Failed to check if index changed: ${errorMessage}`, true, { file: indexPath }));
        // Fall back to full parse
        return parse(indexPath, workspace, packageName);
    }
    if (!changed) {
        // Return previous result if unchanged
        return previousResult;
    }
    // If no previous file hashes, fall back to full parse
    if (!previousResult.fileHashes ||
        Object.keys(previousResult.fileHashes).length === 0) {
        return parse(indexPath, workspace, packageName);
    }
    // Step 1: Read the binary SCIP index file
    let indexBuffer;
    try {
        indexBuffer = await readFile(indexPath);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.FILE_READ_ERROR, `Failed to read SCIP index file for incremental parse: ${errorMessage}`, true, { file: indexPath }));
        // Fall back to returning previous result with error
        return {
            ...previousResult,
            errors: [...(previousResult.errors || []), ...errors],
        };
    }
    // Compute new overall hash
    const hash = createHash("sha256").update(indexBuffer).digest("hex");
    // Step 2: Load protobuf schema and decode
    let root;
    let index;
    try {
        root = await loadProtoSchema();
        const IndexType = root.lookupType("scip.Index");
        const indexMessage = IndexType.decode(indexBuffer);
        index = IndexType.toObject(indexMessage, {
            longs: Number,
            enums: Number,
            defaults: true,
            arrays: true,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.PROTOBUF_DECODE_ERROR, `Failed to decode SCIP index for incremental parse: ${errorMessage}`, true, { file: indexPath }));
        // Fall back to full parse
        try {
            return await parse(indexPath, workspace, packageName);
        }
        catch {
            return {
                symbols: [],
                relationships: [],
                hash: "",
                errors,
            };
        }
    }
    // Step 3: Validate index structure
    const structureErrors = validateIndexStructure(index);
    errors.push(...structureErrors);
    const hasNonRecoverableStructureError = structureErrors.some((e) => !e.recoverable);
    if (hasNonRecoverableStructureError) {
        return {
            symbols: [],
            relationships: [],
            hash,
            errors,
        };
    }
    // Step 4: Track which files have changed
    const changedFiles = new Set();
    const deletedFiles = new Set(Object.keys(previousResult.fileHashes));
    const newFileHashes = {};
    const documents = Array.isArray(index.documents) ? index.documents : [];
    // Compute per-file hashes and identify changed files
    for (const doc of documents) {
        if (!doc || typeof doc !== "object")
            continue;
        const filePath = doc.relativePath || "";
        try {
            const currentHash = computeDocumentHash(doc);
            newFileHashes[filePath] = currentHash;
            // Remove from deleted set since file still exists
            deletedFiles.delete(filePath);
            // Check if file has changed
            const previousHash = previousResult.fileHashes[filePath];
            if (!previousHash || previousHash !== currentHash) {
                changedFiles.add(filePath);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Failed to compute hash for document '${filePath}': ${errorMessage}`, true, { file: filePath }));
            // Treat as changed to be safe
            changedFiles.add(filePath);
        }
    }
    // If all files changed or most files changed, do a full re-parse
    // (incremental parsing overhead isn't worth it)
    const totalFiles = documents.length;
    const unchangedFiles = totalFiles - changedFiles.size;
    if (unchangedFiles < totalFiles * 0.3) {
        // Less than 30% unchanged, do full parse
        return parse(indexPath, workspace, packageName);
    }
    // Step 5: Build symbol map and preserve unchanged symbols
    const symbolMap = new Map();
    const symbols = [];
    // Preserve symbols from unchanged files
    for (const symbol of previousResult.symbols) {
        const filePath = symbol.location.file;
        if (!changedFiles.has(filePath) && !deletedFiles.has(filePath)) {
            symbols.push(symbol);
            // We need to rebuild the symbolMap for relationship extraction
            // Use a synthetic SCIP symbol key based on the ARN
            symbolMap.set(`preserved:${symbol.arn}`, symbol);
        }
    }
    // Step 6: Process only changed documents
    for (const doc of documents) {
        if (!doc || typeof doc !== "object")
            continue;
        const filePath = doc.relativePath || "";
        if (changedFiles.has(filePath)) {
            // Validate document structure
            const docErrors = validateDocument(doc, documents.indexOf(doc));
            errors.push(...docErrors);
            const hasNonRecoverableDocError = docErrors.some((e) => !e.recoverable);
            if (hasNonRecoverableDocError) {
                continue;
            }
            // Process the changed document
            const docSymbols = processDocument(doc, workspace, packageName, symbolMap, errors);
            symbols.push(...docSymbols);
        }
    }
    // Step 7: Process external symbols (always process these as they may reference changed files)
    const externalSymbols = Array.isArray(index.externalSymbols)
        ? index.externalSymbols
        : [];
    for (const extSymbol of externalSymbols) {
        if (!extSymbol || symbolMap.has(extSymbol.symbol))
            continue;
        const symbolError = validateSymbolFormat(extSymbol.symbol, "external");
        if (symbolError) {
            errors.push(symbolError);
            continue;
        }
        try {
            const symbolName = parseScipSymbolName(extSymbol.symbol);
            const kind = mapScipKind(extSymbol.kind);
            const extractedFile = extractFileFromSymbol(extSymbol.symbol);
            const arn = generateArn({
                type: "code",
                workspace,
                package: packageName,
                path: extractedFile || "external",
                symbol: symbolName || undefined,
            });
            const symbol = {
                name: symbolName,
                kind,
                signature: extSymbol.displayName || symbolName,
                documentation: extSymbol.documentation?.join("\n"),
                location: { file: extractedFile || "external", line: 1, column: 0 },
                arn,
            };
            symbolMap.set(extSymbol.symbol, symbol);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(createParseError(ScipErrorCode.DOCUMENT_PROCESSING_ERROR, `Error processing external symbol '${extSymbol.symbol}': ${errorMessage}`, true, { context: { symbol: extSymbol.symbol } }));
        }
    }
    // Step 8: Extract relationships from all documents
    let relationships = [];
    try {
        // We need to re-extract relationships because they may cross file boundaries
        relationships = extractRelationships(documents, symbolMap, workspace, packageName);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(createParseError(ScipErrorCode.RELATIONSHIP_EXTRACTION_ERROR, `Failed to extract relationships during incremental parse: ${errorMessage}`, true, { context: { symbolCount: symbols.length } }));
    }
    // Also preserve relationships that only involve unchanged files
    const unchangedArns = new Set(previousResult.symbols
        .filter((s) => !changedFiles.has(s.location.file) &&
        !deletedFiles.has(s.location.file))
        .map((s) => s.arn));
    // Merge preserved relationships that don't involve changed files
    for (const rel of previousResult.relationships) {
        const fromUnchanged = unchangedArns.has(rel.from);
        const toUnchanged = unchangedArns.has(rel.to);
        // Only preserve if both ends are from unchanged files
        // and the relationship isn't already in the new set
        if (fromUnchanged && toUnchanged) {
            const exists = relationships.some((r) => r.from === rel.from && r.to === rel.to && r.type === rel.type);
            if (!exists) {
                relationships.push(rel);
            }
        }
    }
    return {
        symbols,
        relationships,
        hash,
        fileHashes: newFileHashes,
        errors: errors.length > 0 ? errors : undefined,
    };
}
//# sourceMappingURL=scip_parser.js.map