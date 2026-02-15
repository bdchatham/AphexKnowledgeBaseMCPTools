/**
 * Documentation Generator
 *
 * Generates plain English documentation from SCIP symbol information.
 * Creates .archon.md files co-located with source files.
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */
import { parse as parseArn } from "./arn.js";
// ============================================================================
// Documentation Templates
// ============================================================================
/**
 * Template placeholders:
 * - {{name}} - Symbol name
 * - {{kind}} - Human-readable kind description
 * - {{location}} - File path and line number
 * - {{documentation}} - Symbol documentation (if present)
 * - {{signature}} - Symbol signature (if present)
 * - {{relationships}} - Related symbols section (if present)
 * - {{arn}} - Symbol ARN
 * - {{sourcePath}} - Source file path
 */
/**
 * Template for function symbols.
 * Emphasizes parameters, return values, and usage.
 */
const FUNCTION_TEMPLATE = {
    kind: "function",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{signature}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Template for class symbols.
 * Emphasizes class structure, inheritance, and contained members.
 */
const CLASS_TEMPLATE = {
    kind: "class",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{signature}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Template for method symbols.
 * Emphasizes the containing class and method behavior.
 */
const METHOD_TEMPLATE = {
    kind: "method",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{signature}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Template for module symbols.
 * Emphasizes exports, imports, and module-level organization.
 */
const MODULE_TEMPLATE = {
    kind: "module",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Template for variable symbols.
 * Emphasizes the variable's type and usage.
 */
const VARIABLE_TEMPLATE = {
    kind: "variable",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{signature}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Template for type symbols.
 * Emphasizes the type definition and its structure.
 */
const TYPE_TEMPLATE = {
    kind: "type",
    template: `# {{name}}

<!-- archon:generated -->
<!-- source-arn: {{arn}} -->

## Purpose

This {{kind}} is defined in \`{{sourcePath}}\` at {{location}}.

{{documentation}}

{{signature}}

{{relationships}}

**Source**
- \`{{sourcePath}}\`
`,
};
/**
 * Map of symbol kinds to their documentation templates.
 * Used by getTemplateForKind to retrieve the appropriate template.
 */
const TEMPLATES = {
    function: FUNCTION_TEMPLATE,
    class: CLASS_TEMPLATE,
    method: METHOD_TEMPLATE,
    module: MODULE_TEMPLATE,
    variable: VARIABLE_TEMPLATE,
    type: TYPE_TEMPLATE,
};
/**
 * Get the documentation template for a given symbol kind.
 *
 * @param kind - The symbol kind to get the template for
 * @returns The documentation template for the symbol kind
 */
export function getTemplateForKind(kind) {
    const template = TEMPLATES[kind];
    // All symbol kinds have templates defined, so this should never be undefined
    // but we provide a fallback for type safety
    if (!template) {
        return FUNCTION_TEMPLATE;
    }
    return template;
}
/**
 * Get all available documentation templates.
 *
 * @returns Array of all documentation templates
 */
export function getAllTemplates() {
    return Object.values(TEMPLATES);
}
/**
 * Render a template by replacing placeholders with actual values.
 * Placeholders are in the format {{placeholder}}.
 *
 * @param template - The template string with placeholders
 * @param placeholders - The values to substitute for placeholders
 * @returns The rendered template string
 */
export function renderTemplate(template, placeholders) {
    let result = template;
    // Replace each placeholder with its value
    result = result.replace(/\{\{name\}\}/g, placeholders.name);
    result = result.replace(/\{\{kind\}\}/g, placeholders.kind);
    result = result.replace(/\{\{location\}\}/g, placeholders.location);
    result = result.replace(/\{\{arn\}\}/g, placeholders.arn);
    result = result.replace(/\{\{sourcePath\}\}/g, placeholders.sourcePath);
    // Handle optional sections - documentation
    if (placeholders.documentation) {
        result = result.replace(/\{\{documentation\}\}/g, `## Description\n\n${placeholders.documentation}\n`);
    }
    else {
        result = result.replace(/\{\{documentation\}\}\n*/g, "");
    }
    // Handle optional sections - signature
    if (placeholders.signature) {
        result = result.replace(/\{\{signature\}\}/g, `## Signature\n\n\`\`\`\n${placeholders.signature}\n\`\`\`\n`);
    }
    else {
        result = result.replace(/\{\{signature\}\}\n*/g, "");
    }
    // Handle optional sections - relationships
    if (placeholders.relationships) {
        result = result.replace(/\{\{relationships\}\}/g, placeholders.relationships);
    }
    else {
        result = result.replace(/\{\{relationships\}\}\n*/g, "");
    }
    // Clean up any double newlines that might result from empty sections
    result = result.replace(/\n{3,}/g, "\n\n");
    return result;
}
/**
 * Build the relationships section content for a symbol.
 *
 * @param relationships - The relationships to include
 * @param symbolArn - The ARN of the symbol being documented
 * @returns The formatted relationships section, or empty string if no relationships
 */
function buildRelationshipsSection(relationships, symbolArn) {
    const grouped = groupRelationshipsByType(relationships, symbolArn);
    const referencedArns = [];
    if (grouped.size === 0) {
        return { content: "", referencedArns };
    }
    const lines = [];
    lines.push("## Related Symbols");
    lines.push("");
    for (const [relType, relatedArns] of grouped) {
        lines.push(`### ${getRelationshipDescription(relType)}`);
        lines.push("");
        for (const relatedArn of relatedArns) {
            const symbolName = extractSymbolNameFromArn(relatedArn);
            const arnLink = generateArnLink(symbolName, relatedArn);
            lines.push(`- ${arnLink}`);
            referencedArns.push(relatedArn);
        }
        lines.push("");
    }
    return { content: lines.join("\n"), referencedArns };
}
/**
 * Generate documentation for a symbol using templates.
 * This is an alternative to generateForSymbol that uses the template system.
 *
 * @param symbol - The SCIP symbol to document
 * @param relationships - Relationships involving this symbol
 * @returns Generated documentation with content and ARN references
 */
export function generateForSymbolWithTemplate(symbol, relationships) {
    const sourcePath = symbol.location.file;
    const docPath = generateDocPath(sourcePath);
    // Get the template for this symbol kind
    const template = getTemplateForKind(symbol.kind);
    // Build the relationships section
    const { content: relationshipsContent, referencedArns } = buildRelationshipsSection(relationships, symbol.arn);
    // Prepare placeholder values
    const placeholders = {
        name: symbol.name,
        kind: getKindDescription(symbol.kind),
        location: `line ${symbol.location.line}`,
        documentation: symbol.documentation || "",
        signature: symbol.signature || "",
        relationships: relationshipsContent,
        arn: symbol.arn,
        sourcePath,
    };
    // Render the template
    const content = renderTemplate(template.template, placeholders);
    return {
        sourcePath,
        docPath,
        content,
        arn: symbol.arn,
        referencedArns,
    };
}
/**
 * Generate a human-readable description of a symbol kind.
 *
 * @param kind - The symbol kind
 * @returns A human-readable description
 */
function getKindDescription(kind) {
    const descriptions = {
        function: "function",
        class: "class",
        method: "method",
        variable: "variable",
        type: "type definition",
        module: "module",
    };
    return descriptions[kind] || kind;
}
/**
 * Generate a human-readable description of a relationship type.
 *
 * @param type - The relationship type
 * @returns A human-readable description
 */
function getRelationshipDescription(type) {
    const descriptions = {
        contains: "Contains",
        references: "References",
        implements: "Implements",
        extends: "Extends",
        imports: "Imports",
    };
    return descriptions[type] || type;
}
/**
 * Extract the symbol name from an ARN.
 * Falls back to the full ARN if parsing fails.
 *
 * @param arn - The ARN to extract the symbol name from
 * @returns The symbol name or the full ARN
 */
function extractSymbolNameFromArn(arn) {
    const parsed = parseArn(arn);
    if (parsed?.symbol) {
        return parsed.symbol;
    }
    // Fall back to extracting from the path if no symbol
    if (parsed?.path) {
        const pathParts = parsed.path.split("/");
        const fileName = pathParts[pathParts.length - 1] ?? "";
        // Remove extension
        const dotIndex = fileName.lastIndexOf(".");
        return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    }
    return arn;
}
/**
 * Generate the documentation path from a source path.
 * Converts `<name>.<ext>` to `<name>.archon.md`.
 *
 * @param sourcePath - The source file path
 * @returns The documentation file path
 */
function generateDocPath(sourcePath) {
    const lastDotIndex = sourcePath.lastIndexOf(".");
    if (lastDotIndex > 0) {
        return `${sourcePath.slice(0, lastDotIndex)}.archon.md`;
    }
    return `${sourcePath}.archon.md`;
}
/**
 * Generate an ARN reference link in Markdown format.
 *
 * @param symbolName - The display name for the link
 * @param arn - The ARN to link to
 * @returns A Markdown link in the format [SymbolName](arn:archon:...)
 */
function generateArnLink(symbolName, arn) {
    return `[${symbolName}](${arn})`;
}
/**
 * Group relationships by their type for organized documentation.
 *
 * @param relationships - The relationships to group
 * @param symbolArn - The ARN of the symbol being documented
 * @returns A map of relationship types to arrays of related ARNs
 */
function groupRelationshipsByType(relationships, symbolArn) {
    const grouped = new Map();
    for (const rel of relationships) {
        // Include relationships where this symbol is the source
        if (rel.from === symbolArn) {
            const existing = grouped.get(rel.type) || [];
            existing.push(rel.to);
            grouped.set(rel.type, existing);
        }
    }
    return grouped;
}
/**
 * Generate documentation for a single symbol.
 * Includes ARN references to related symbols.
 *
 * @param symbol - The SCIP symbol to document
 * @param relationships - Relationships involving this symbol
 * @returns Generated documentation with content and ARN references
 */
export function generateForSymbol(symbol, relationships) {
    const sourcePath = symbol.location.file;
    const docPath = generateDocPath(sourcePath);
    const referencedArns = [];
    // Build the documentation content
    const lines = [];
    // Header with symbol name
    lines.push(`# ${symbol.name}`);
    lines.push("");
    // Archon metadata markers
    lines.push("<!-- archon:generated -->");
    lines.push(`<!-- source-arn: ${symbol.arn} -->`);
    lines.push("");
    // Purpose section with plain English description
    lines.push("## Purpose");
    lines.push("");
    lines.push(`This ${getKindDescription(symbol.kind)} is defined in \`${sourcePath}\` at line ${symbol.location.line}.`);
    lines.push("");
    // Include documentation from source if available
    if (symbol.documentation) {
        lines.push("## Description");
        lines.push("");
        lines.push(symbol.documentation);
        lines.push("");
    }
    // Signature section
    if (symbol.signature) {
        lines.push("## Signature");
        lines.push("");
        lines.push("```");
        lines.push(symbol.signature);
        lines.push("```");
        lines.push("");
    }
    // Related symbols section with ARN references
    const groupedRelationships = groupRelationshipsByType(relationships, symbol.arn);
    if (groupedRelationships.size > 0) {
        lines.push("## Related Symbols");
        lines.push("");
        for (const [relType, relatedArns] of groupedRelationships) {
            lines.push(`### ${getRelationshipDescription(relType)}`);
            lines.push("");
            for (const relatedArn of relatedArns) {
                const symbolName = extractSymbolNameFromArn(relatedArn);
                const arnLink = generateArnLink(symbolName, relatedArn);
                lines.push(`- ${arnLink}`);
                referencedArns.push(relatedArn);
            }
            lines.push("");
        }
    }
    // Source provenance
    lines.push("**Source**");
    lines.push(`- \`${sourcePath}\``);
    lines.push("");
    const content = lines.join("\n");
    return {
        sourcePath,
        docPath,
        content,
        arn: symbol.arn,
        referencedArns,
    };
}
/**
 * Generate the documentation ARN for a file.
 * Uses the 'doc' type to distinguish from code ARNs.
 *
 * @param filePath - The source file path
 * @returns The documentation ARN
 */
function generateDocArn(filePath) {
    // Extract workspace and package from the file path context
    // For now, use placeholder values that can be overridden
    // In practice, these would come from the calling context
    return `arn:archon:doc:workspace/package/${filePath}`;
}
/**
 * Filter symbols to only include exported/public symbols.
 * Public symbols are those that would be part of the module's public API.
 *
 * @param symbols - All symbols in the file
 * @returns Only the public/exported symbols
 */
function filterPublicSymbols(symbols) {
    // For now, include all symbols as we don't have export information in SCIP
    // In a more complete implementation, we would filter based on visibility
    return symbols;
}
/**
 * Group symbols by their kind for organized documentation.
 *
 * @param symbols - The symbols to group
 * @returns A map of symbol kinds to arrays of symbols
 */
function groupSymbolsByKind(symbols) {
    const grouped = new Map();
    for (const symbol of symbols) {
        const existing = grouped.get(symbol.kind) || [];
        existing.push(symbol);
        grouped.set(symbol.kind, existing);
    }
    return grouped;
}
/**
 * Get a plural description for a symbol kind.
 *
 * @param kind - The symbol kind
 * @returns A plural human-readable description
 */
function getKindPluralDescription(kind) {
    const descriptions = {
        function: "Functions",
        class: "Classes",
        method: "Methods",
        variable: "Variables",
        type: "Types",
        module: "Modules",
    };
    return descriptions[kind] || `${kind}s`;
}
/**
 * Generate a brief summary for a symbol.
 *
 * @param symbol - The symbol to summarize
 * @returns A brief summary string
 */
function generateSymbolSummary(symbol) {
    if (symbol.documentation) {
        // Take the first sentence or first 100 characters
        const firstSentence = symbol.documentation.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length <= 100) {
            return firstSentence.trim();
        }
        return symbol.documentation.slice(0, 100).trim() + "...";
    }
    return `A ${getKindDescription(symbol.kind)} defined at line ${symbol.location.line}`;
}
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
export function generateForFile(filePath, symbols, relationships) {
    const docPath = generateDocPath(filePath);
    const docArn = generateDocArn(filePath);
    const referencedArns = [];
    // Build the documentation content
    const lines = [];
    // Extract file name for the title
    const pathParts = filePath.split("/");
    const fileName = pathParts[pathParts.length - 1] ?? filePath;
    // Header with file name
    lines.push(`# ${fileName}`);
    lines.push("");
    // Archon metadata markers
    lines.push("<!-- archon:generated -->");
    lines.push(`<!-- arn: ${docArn} -->`);
    lines.push("");
    // File overview section
    lines.push("## Overview");
    lines.push("");
    lines.push(`This file is located at \`${filePath}\`.`);
    lines.push("");
    // Count symbols by kind for the overview
    const publicSymbols = filterPublicSymbols(symbols);
    const groupedSymbols = groupSymbolsByKind(publicSymbols);
    if (publicSymbols.length > 0) {
        lines.push("**Contents:**");
        for (const [kind, kindSymbols] of groupedSymbols) {
            lines.push(`- ${kindSymbols.length} ${getKindPluralDescription(kind).toLowerCase()}`);
        }
        lines.push("");
    }
    else {
        lines.push("This file contains no documented symbols.");
        lines.push("");
    }
    // Public API section
    if (publicSymbols.length > 0) {
        lines.push("## Public API");
        lines.push("");
        // Group by kind and document each group
        for (const [kind, kindSymbols] of groupedSymbols) {
            lines.push(`### ${getKindPluralDescription(kind)}`);
            lines.push("");
            for (const symbol of kindSymbols) {
                // Symbol name with ARN link
                const arnLink = generateArnLink(symbol.name, symbol.arn);
                lines.push(`#### ${arnLink}`);
                lines.push("");
                // Brief summary
                lines.push(generateSymbolSummary(symbol));
                lines.push("");
                // Signature if available
                if (symbol.signature) {
                    lines.push("```");
                    lines.push(symbol.signature);
                    lines.push("```");
                    lines.push("");
                }
                // Location
                lines.push(`*Defined at line ${symbol.location.line}*`);
                lines.push("");
                // Collect referenced ARNs from relationships
                const symbolRelationships = relationships.filter((rel) => rel.from === symbol.arn);
                for (const rel of symbolRelationships) {
                    if (!referencedArns.includes(rel.to)) {
                        referencedArns.push(rel.to);
                    }
                }
            }
        }
    }
    // Related symbols section (aggregated from all symbols)
    const allRelationships = new Map();
    for (const symbol of symbols) {
        const symbolRels = relationships.filter((rel) => rel.from === symbol.arn);
        for (const rel of symbolRels) {
            const existing = allRelationships.get(rel.type) || new Set();
            existing.add(rel.to);
            allRelationships.set(rel.type, existing);
        }
    }
    if (allRelationships.size > 0) {
        lines.push("## Dependencies");
        lines.push("");
        for (const [relType, relatedArns] of allRelationships) {
            lines.push(`### ${getRelationshipDescription(relType)}`);
            lines.push("");
            for (const relatedArn of relatedArns) {
                const symbolName = extractSymbolNameFromArn(relatedArn);
                const arnLink = generateArnLink(symbolName, relatedArn);
                lines.push(`- ${arnLink}`);
                if (!referencedArns.includes(relatedArn)) {
                    referencedArns.push(relatedArn);
                }
            }
            lines.push("");
        }
    }
    // Source provenance
    lines.push("---");
    lines.push("");
    lines.push("**Source**");
    lines.push(`- \`${filePath}\``);
    lines.push("");
    const content = lines.join("\n");
    return {
        sourcePath: filePath,
        docPath,
        content,
        arn: docArn,
        referencedArns,
    };
}
/**
 * Manual section marker constants.
 * These markers delimit user-edited content that should be preserved during regeneration.
 */
const MANUAL_SECTION_START = "<!-- archon:manual -->";
const MANUAL_SECTION_END = "<!-- /archon:manual -->";
/**
 * Extract all manual sections from a document.
 * Manual sections are delimited by <!-- archon:manual --> and <!-- /archon:manual --> markers.
 *
 * @param doc - The document content to extract manual sections from
 * @returns Array of ManualSection objects containing the markers and content
 */
export function extractManualSections(doc) {
    const sections = [];
    // Use a simple state machine approach to find manual sections
    // This avoids issues with regex and handles edge cases better
    let searchStart = 0;
    while (searchStart < doc.length) {
        const startIndex = doc.indexOf(MANUAL_SECTION_START, searchStart);
        if (startIndex === -1) {
            break;
        }
        const contentStart = startIndex + MANUAL_SECTION_START.length;
        const endIndex = doc.indexOf(MANUAL_SECTION_END, contentStart);
        if (endIndex === -1) {
            // No closing marker found - skip this opening marker
            // This handles malformed documents gracefully
            searchStart = contentStart;
            continue;
        }
        // Extract the content between markers
        const content = doc.slice(contentStart, endIndex);
        const fullMatch = doc.slice(startIndex, endIndex + MANUAL_SECTION_END.length);
        sections.push({
            startMarker: MANUAL_SECTION_START,
            endMarker: MANUAL_SECTION_END,
            content,
            fullMatch,
        });
        // Move past this section to find any additional sections
        searchStart = endIndex + MANUAL_SECTION_END.length;
    }
    return sections;
}
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
export function preserveManualSections(existingDoc, newDoc) {
    // Extract manual sections from the existing document
    const existingSections = extractManualSections(existingDoc);
    // If no manual sections in existing doc, return new doc unchanged
    if (existingSections.length === 0) {
        return newDoc;
    }
    // Extract manual sections from the new document
    const newSections = extractManualSections(newDoc);
    // If the new document has manual section markers, replace their content
    // with the content from the existing document's manual sections
    if (newSections.length > 0) {
        let result = newDoc;
        // Match sections by index (first existing section goes into first new section, etc.)
        const sectionsToReplace = Math.min(existingSections.length, newSections.length);
        for (let i = 0; i < sectionsToReplace; i++) {
            const existingSection = existingSections[i];
            const newSection = newSections[i];
            if (existingSection && newSection) {
                // Build the replacement with existing content
                const replacement = MANUAL_SECTION_START + existingSection.content + MANUAL_SECTION_END;
                // Replace the new section's full match with the preserved content
                // Use a function as the replacement to avoid special character handling
                // ($ is a special character in String.replace replacement strings)
                result = result.replace(newSection.fullMatch, () => replacement);
            }
        }
        // If there are more existing sections than new sections, append the extras
        if (existingSections.length > newSections.length) {
            const extraSections = existingSections.slice(newSections.length);
            for (const section of extraSections) {
                result = result.trimEnd() + "\n\n" + section.fullMatch + "\n";
            }
        }
        return result;
    }
    // If the new document doesn't have manual section markers,
    // append the existing manual sections to the end
    let result = newDoc.trimEnd();
    for (const section of existingSections) {
        result += "\n\n" + section.fullMatch;
    }
    return result + "\n";
}
/**
 * Index hash marker used in generated documentation.
 * This marker stores the SCIP index hash that was used to generate the documentation.
 */
const INDEX_HASH_MARKER_PREFIX = "<!-- index-hash: ";
const INDEX_HASH_MARKER_SUFFIX = " -->";
/**
 * Orphaned documentation marker.
 * This marker indicates that the source file for this documentation has been deleted.
 */
const ORPHANED_MARKER = "<!-- archon:orphaned -->";
/**
 * Extract the stored index hash from documentation content.
 * Looks for a comment in the format: <!-- index-hash: <hash> -->
 *
 * @param content - The documentation content to search
 * @returns The stored hash if found, null otherwise
 */
export function extractIndexHash(content) {
    const startIndex = content.indexOf(INDEX_HASH_MARKER_PREFIX);
    if (startIndex === -1) {
        return null;
    }
    const hashStart = startIndex + INDEX_HASH_MARKER_PREFIX.length;
    const endIndex = content.indexOf(INDEX_HASH_MARKER_SUFFIX, hashStart);
    if (endIndex === -1) {
        return null;
    }
    const hash = content.slice(hashStart, endIndex).trim();
    return hash.length > 0 ? hash : null;
}
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
export async function needsRegeneration(docPath, indexHash) {
    // Import fs/promises dynamically to avoid issues with module resolution
    const { readFile } = await import("node:fs/promises");
    try {
        // Attempt to read the existing documentation file
        const content = await readFile(docPath, "utf-8");
        // Extract the stored index hash from the documentation
        const storedHash = extractIndexHash(content);
        // If no stored hash is found, regeneration is needed
        if (storedHash === null) {
            return true;
        }
        // Compare the stored hash with the current index hash
        // If they match, no regeneration is needed
        return storedHash !== indexHash;
    }
    catch (error) {
        // If the file doesn't exist or can't be read, regeneration is needed
        // Check for ENOENT (file not found) error code
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return true;
        }
        // For other errors (permission issues, etc.), also return true
        // to trigger regeneration as a safe default
        return true;
    }
}
/**
 * Check if a documentation file is already marked as orphaned.
 *
 * @param content - The documentation content to check
 * @returns True if the document contains the orphaned marker
 */
export function isOrphaned(content) {
    return content.includes(ORPHANED_MARKER);
}
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
export async function markOrphaned(docPath) {
    const { readFile, writeFile } = await import("node:fs/promises");
    // Read the existing documentation file
    let content;
    try {
        content = await readFile(docPath, "utf-8");
    }
    catch (error) {
        // Check for ENOENT (file not found) error
        const nodeError = error;
        if (nodeError.code === "ENOENT") {
            throw new Error(`Documentation file not found: ${docPath}`);
        }
        throw error;
    }
    // Check if already marked as orphaned (idempotent operation)
    if (isOrphaned(content)) {
        return;
    }
    // Find the best position to insert the orphaned marker
    // Prefer inserting after <!-- archon:generated --> marker
    const generatedMarker = "<!-- archon:generated -->";
    const generatedIndex = content.indexOf(generatedMarker);
    let modifiedContent;
    if (generatedIndex !== -1) {
        // Insert after the archon:generated marker
        const insertPosition = generatedIndex + generatedMarker.length;
        const beforeMarker = content.slice(0, insertPosition);
        const afterMarker = content.slice(insertPosition);
        // Add the orphaned marker on a new line after the generated marker
        modifiedContent = beforeMarker + "\n" + ORPHANED_MARKER + afterMarker;
    }
    else {
        // No archon:generated marker found - insert after the first heading
        // Look for the first line that starts with #
        const lines = content.split("\n");
        let insertLineIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.startsWith("#")) {
                insertLineIndex = i + 1;
                break;
            }
        }
        // Insert the orphaned marker after the heading (or at the start if no heading)
        lines.splice(insertLineIndex, 0, "", ORPHANED_MARKER);
        modifiedContent = lines.join("\n");
    }
    // Write the modified content back to the file
    await writeFile(docPath, modifiedContent, "utf-8");
}
//# sourceMappingURL=doc_generator.js.map