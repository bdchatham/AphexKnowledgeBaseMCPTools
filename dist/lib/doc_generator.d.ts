/**
 * Documentation Generator
 *
 * Generates plain English documentation from SCIP symbol information.
 * Creates .archon.md files co-located with source files.
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */
import type { ScipSymbol, ScipRelationship, SymbolKind } from "../types/scip.js";
import type { DocTemplate } from "../types/tools.js";
export interface GeneratedDoc {
    sourcePath: string;
    docPath: string;
    content: string;
    arn: string;
    referencedArns: string[];
}
/**
 * Get the documentation template for a given symbol kind.
 *
 * @param kind - The symbol kind to get the template for
 * @returns The documentation template for the symbol kind
 */
export declare function getTemplateForKind(kind: SymbolKind): DocTemplate;
/**
 * Get all available documentation templates.
 *
 * @returns Array of all documentation templates
 */
export declare function getAllTemplates(): DocTemplate[];
/**
 * Template placeholder values for rendering.
 */
interface TemplatePlaceholders {
    name: string;
    kind: string;
    location: string;
    documentation: string;
    signature: string;
    relationships: string;
    arn: string;
    sourcePath: string;
}
/**
 * Render a template by replacing placeholders with actual values.
 * Placeholders are in the format {{placeholder}}.
 *
 * @param template - The template string with placeholders
 * @param placeholders - The values to substitute for placeholders
 * @returns The rendered template string
 */
export declare function renderTemplate(template: string, placeholders: TemplatePlaceholders): string;
/**
 * Generate documentation for a symbol using templates.
 * This is an alternative to generateForSymbol that uses the template system.
 *
 * @param symbol - The SCIP symbol to document
 * @param relationships - Relationships involving this symbol
 * @returns Generated documentation with content and ARN references
 */
export declare function generateForSymbolWithTemplate(symbol: ScipSymbol, relationships: ScipRelationship[]): GeneratedDoc;
/**
 * Generate documentation for a single symbol.
 * Includes ARN references to related symbols.
 *
 * @param symbol - The SCIP symbol to document
 * @param relationships - Relationships involving this symbol
 * @returns Generated documentation with content and ARN references
 */
export declare function generateForSymbol(symbol: ScipSymbol, relationships: ScipRelationship[]): GeneratedDoc;
/**
 * Generate documentation for an entire file.
 * Creates <name>.archon.md co-located with source.
 * Includes file overview, public API listing, and documentation for each symbol.
 *
 * @param filePath - The source file path
 * @param symbols - All symbols in the file
 * @param relationships - Relationships involving symbols in this file
 * @returns Generated documentation with content and ARN references
 */
export declare function generateForFile(filePath: string, symbols: ScipSymbol[], relationships: ScipRelationship[]): GeneratedDoc;
/**
 * Extract all manual sections from a document.
 * Manual sections are delimited by <!-- archon:manual --> and <!-- /archon:manual --> markers.
 *
 * @param doc - The document content to extract manual sections from
 * @returns Array of ManualSection objects containing the markers and content
 */
export declare function extractManualSections(doc: string): Array<{
    startMarker: string;
    endMarker: string;
    content: string;
    fullMatch: string;
}>;
/**
 * Preserve manually-edited sections when regenerating documentation.
 * Sections marked with <!-- archon:manual --> and <!-- /archon:manual --> markers
 * in the existing document are preserved in the new document.
 *
 * The function handles the following cases:
 * 1. If the new document has manual section markers, the content from the existing
 *    document's manual sections replaces the content in the new document's markers.
 * 2. If the new document doesn't have manual section markers but the existing document
 *    does, the manual sections are appended to the end of the new document.
 * 3. If neither document has manual sections, the new document is returned unchanged.
 * 4. Multiple manual sections are supported and matched in order.
 *
 * @param existingDoc - The existing documentation content with manual sections to preserve
 * @param newDoc - The newly generated documentation content
 * @returns The new documentation with manual sections preserved from the existing document
 */
export declare function preserveManualSections(existingDoc: string, newDoc: string): string;
/**
 * Extract the stored index hash from documentation content.
 * Looks for a comment in the format: <!-- index-hash: <hash> -->
 *
 * @param content - The documentation content to search
 * @returns The stored hash if found, null otherwise
 */
export declare function extractIndexHash(content: string): string | null;
/**
 * Check if documentation needs regeneration based on index hash comparison.
 * Returns true if regeneration is needed, false if the documentation is up-to-date.
 *
 * Regeneration is needed when:
 * - The documentation file doesn't exist
 * - The stored hash is missing from the documentation
 * - The stored hash doesn't match the current index hash
 *
 * @param docPath - Path to the documentation file
 * @param indexHash - Current SCIP index hash to compare against
 * @returns Promise resolving to true if regeneration is needed, false otherwise
 */
export declare function needsRegeneration(docPath: string, indexHash: string): Promise<boolean>;
/**
 * Check if a documentation file is already marked as orphaned.
 *
 * @param content - The documentation content to check
 * @returns True if the document contains the orphaned marker
 */
export declare function isOrphaned(content: string): boolean;
/**
 * Mark documentation as orphaned when the source file is deleted.
 * Adds an `<!-- archon:orphaned -->` marker near the top of the file,
 * after the title and archon:generated marker.
 *
 * The function handles the following cases:
 * 1. If the file doesn't exist, throws an error
 * 2. If the file is already marked as orphaned, does nothing (idempotent)
 * 3. Otherwise, adds the orphaned marker after the archon:generated marker
 *
 * @param docPath - Path to the documentation file to mark as orphaned
 * @throws Error if the file doesn't exist or cannot be read/written
 */
export declare function markOrphaned(docPath: string): Promise<void>;
export {};
//# sourceMappingURL=doc_generator.d.ts.map