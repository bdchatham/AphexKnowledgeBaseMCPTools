/**
 * SCIP-Related Type Definitions
 *
 * Types for SCIP index parsing and symbol representation.
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */
/**
 * Symbol kinds supported by the SCIP parser.
 * Maps to SCIP symbol kinds for functions, classes, methods, variables, types, and modules.
 */
export type SymbolKind = "function" | "class" | "method" | "variable" | "type" | "module";
/**
 * Relationship types between symbols extracted from SCIP indexes.
 * - contains: parent-child relationships (e.g., class contains method)
 * - references: symbol usage relationships
 * - implements: interface implementation relationships
 * - extends: inheritance relationships
 * - imports: module import relationships
 */
export type RelationshipType = "contains" | "references" | "implements" | "extends" | "imports";
/**
 * Location of a symbol within a source file.
 */
export interface SymbolLocation {
    /** File path relative to package root */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (0-indexed) */
    column: number;
}
/**
 * Parsed symbol from a SCIP index with ARN reference.
 */
export interface ScipSymbol {
    /** Symbol name (e.g., function name, class name) */
    name: string;
    /** Kind of symbol */
    kind: SymbolKind;
    /** Symbol signature (e.g., function signature with parameters) */
    signature: string;
    /** Documentation string if present in source */
    documentation?: string;
    /** Location of the symbol definition */
    location: SymbolLocation;
    /** Archon Resource Name for this symbol */
    arn: string;
}
/**
 * Relationship between two symbols identified by their ARNs.
 */
export interface ScipRelationship {
    /** ARN of the source symbol */
    from: string;
    /** ARN of the target symbol */
    to: string;
    /** Type of relationship */
    type: RelationshipType;
}
/**
 * Error encountered during SCIP index parsing.
 * Supports graceful error handling with diagnostic information.
 */
export interface ScipParseError {
    /** Human-readable error message */
    message: string;
    /** File where the error occurred (if applicable) */
    file?: string;
    /** Line number where the error occurred (if applicable) */
    line?: number;
    /** Whether parsing can continue after this error */
    recoverable: boolean;
}
/**
 * Result of parsing a SCIP index file.
 * Contains extracted symbols, relationships, content hash, and any errors.
 */
export interface ScipParseResult {
    /** All symbols extracted from the index */
    symbols: ScipSymbol[];
    /** Relationships between symbols */
    relationships: ScipRelationship[];
    /** SHA-256 hash of the index content for change detection */
    hash: string;
    /** Per-file hashes for incremental parsing (file path -> hash) */
    fileHashes?: Record<string, string>;
    /** Errors encountered during parsing (if any) */
    errors?: ScipParseError[];
}
//# sourceMappingURL=scip.d.ts.map