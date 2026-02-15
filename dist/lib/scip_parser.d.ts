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
import type { ScipParseResult, ScipParseError } from "../types/scip.js";
/**
 * Error codes for categorizing SCIP parsing errors.
 * Used for programmatic error handling and diagnostics.
 */
export declare enum ScipErrorCode {
    FILE_READ_ERROR = "FILE_READ_ERROR",
    PROTOBUF_DECODE_ERROR = "PROTOBUF_DECODE_ERROR",
    INVALID_INDEX_STRUCTURE = "INVALID_INDEX_STRUCTURE",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
    INVALID_SYMBOL_FORMAT = "INVALID_SYMBOL_FORMAT",
    INVALID_OCCURRENCE_RANGE = "INVALID_OCCURRENCE_RANGE",
    DOCUMENT_PROCESSING_ERROR = "DOCUMENT_PROCESSING_ERROR",
    RELATIONSHIP_EXTRACTION_ERROR = "RELATIONSHIP_EXTRACTION_ERROR"
}
/**
 * Extended error information for SCIP parsing errors.
 * Provides additional context for debugging and diagnostics.
 */
export interface ScipParseErrorExtended extends ScipParseError {
    /** Error code for programmatic handling */
    code?: ScipErrorCode;
    /** Additional context about the error */
    context?: Record<string, unknown>;
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
export declare function parse(indexPath: string, workspace: string, packageName: string): Promise<ScipParseResult>;
/**
 * Check if index has changed by comparing hashes.
 *
 * @param indexPath - Path to the SCIP index file
 * @param storedHash - Previously stored hash to compare against
 * @returns True if the index has changed
 */
export declare function hasChanged(indexPath: string, storedHash: string): Promise<boolean>;
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
export declare function parseIncremental(indexPath: string, workspace: string, packageName: string, previousResult: ScipParseResult): Promise<ScipParseResult>;
//# sourceMappingURL=scip_parser.d.ts.map