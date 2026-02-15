/**
 * Documentation Generation Tool
 *
 * MCP tool that generates plain English documentation from SCIP indexes.
 * Creates .archon.md files co-located with source files.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve, dirname, extname } from "node:path";
import { parse } from "../lib/scip_parser.js";
import { generateForFile, needsRegeneration, preserveManualSections, } from "../lib/doc_generator.js";
/**
 * Default workspace name used for ARN generation.
 * In a full implementation, this would be derived from configuration.
 */
const DEFAULT_WORKSPACE = "workspace";
/**
 * Check if a file exists.
 */
async function fileExists(filePath) {
    try {
        await stat(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Find all SCIP index files in a package's .archon/scip/ directory.
 *
 * @param packagePath - Path to the package
 * @returns Array of paths to SCIP index files
 */
async function findScipIndexes(packagePath) {
    const scipDir = join(packagePath, ".archon", "scip");
    const indexes = [];
    try {
        const entries = await readdir(scipDir);
        for (const entry of entries) {
            if (entry.endsWith(".scip")) {
                indexes.push(join(scipDir, entry));
            }
        }
    }
    catch {
        // Directory doesn't exist or can't be read
    }
    return indexes;
}
/**
 * Read the metadata.json file from the .archon/scip/ directory.
 *
 * @param packagePath - Path to the package
 * @returns Metadata object or null if not found
 */
async function readScipMetadata(packagePath) {
    const metadataPath = join(packagePath, ".archon", "scip", "metadata.json");
    try {
        const content = await readFile(metadataPath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Extract the package name from the package path.
 *
 * @param packagePath - Path to the package
 * @returns The package name (last component of the path)
 */
function extractPackageName(packagePath) {
    const normalized = packagePath.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = normalized.split("/");
    return parts[parts.length - 1] ?? "unknown";
}
/**
 * Group symbols by their source file.
 *
 * @param symbols - Array of SCIP symbols
 * @returns Map of file paths to arrays of symbols
 */
function groupSymbolsByFile(symbols) {
    const grouped = new Map();
    for (const symbol of symbols) {
        const filePath = symbol.location.file;
        const existing = grouped.get(filePath) ?? [];
        existing.push(symbol);
        grouped.set(filePath, existing);
    }
    return grouped;
}
/**
 * Filter relationships to only include those relevant to a specific file.
 *
 * @param relationships - All relationships
 * @param fileSymbols - Symbols in the target file
 * @returns Relationships involving symbols in the file
 */
function filterRelationshipsForFile(relationships, fileSymbols) {
    const symbolArns = new Set(fileSymbols.map((s) => s.arn));
    return relationships.filter((rel) => symbolArns.has(rel.from) || symbolArns.has(rel.to));
}
/**
 * Generate the documentation path from a source path.
 * Converts `<name>.<ext>` to `<name>.archon.md`.
 *
 * @param sourcePath - The source file path
 * @returns The documentation file path
 */
function generateDocPath(sourcePath) {
    const ext = extname(sourcePath);
    if (ext) {
        return sourcePath.slice(0, -ext.length) + ".archon.md";
    }
    return sourcePath + ".archon.md";
}
/**
 * Add index hash marker to documentation content.
 *
 * @param content - The documentation content
 * @param hash - The SCIP index hash
 * @returns Content with hash marker added
 */
function addIndexHashMarker(content, hash) {
    const hashMarker = `<!-- index-hash: ${hash} -->`;
    // Find the position after <!-- archon:generated --> marker
    const generatedMarker = "<!-- archon:generated -->";
    const generatedIndex = content.indexOf(generatedMarker);
    if (generatedIndex !== -1) {
        const insertPosition = generatedIndex + generatedMarker.length;
        const beforeMarker = content.slice(0, insertPosition);
        const afterMarker = content.slice(insertPosition);
        // Check if there's already a hash marker
        if (afterMarker.includes("<!-- index-hash:")) {
            // Replace existing hash marker
            return content.replace(/<!-- index-hash: [a-f0-9]+ -->/, hashMarker);
        }
        return beforeMarker + "\n" + hashMarker + afterMarker;
    }
    // If no archon:generated marker, add hash after the first line
    const lines = content.split("\n");
    if (lines.length > 0) {
        lines.splice(1, 0, hashMarker);
        return lines.join("\n");
    }
    return hashMarker + "\n" + content;
}
/**
 * Generate Archon documentation for a package.
 *
 * This tool:
 * 1. Finds SCIP index files in the package's .archon/scip/ directory
 * 2. Parses the SCIP index to extract symbols
 * 3. Generates .archon.md documentation files co-located with source files
 * 4. Supports filtering to specific files if the `files` parameter is provided
 * 5. Supports force regeneration with the `force` parameter
 *
 * @param input - The input parameters for documentation generation
 * @returns The result of the documentation generation operation
 */
export async function generateArchonDoc(input) {
    const { packagePath, files, force = false } = input;
    const resolvedPath = resolve(packagePath);
    const errors = [];
    const filesGenerated = [];
    const filesSkipped = [];
    // Find SCIP index files
    const indexPaths = await findScipIndexes(resolvedPath);
    if (indexPaths.length === 0) {
        return {
            success: false,
            packagePath: resolvedPath,
            filesGenerated: [],
            filesSkipped: [],
            errors: [
                `No SCIP index files found in ${resolvedPath}/.archon/scip/. ` +
                    "Run generate_scip_index first to create SCIP indexes.",
            ],
        };
    }
    // Extract package name for ARN generation
    const packageName = extractPackageName(resolvedPath);
    // Read metadata for hash information
    const metadata = await readScipMetadata(resolvedPath);
    // Process each SCIP index
    for (const indexPath of indexPaths) {
        // Parse the SCIP index
        const parseResult = await parse(indexPath, DEFAULT_WORKSPACE, packageName);
        if (parseResult.errors && parseResult.errors.length > 0) {
            // Collect non-recoverable errors
            const nonRecoverableErrors = parseResult.errors.filter((e) => !e.recoverable);
            for (const error of nonRecoverableErrors) {
                errors.push(`SCIP parse error: ${error.message}`);
            }
            // If there are non-recoverable errors and no symbols, skip this index
            if (nonRecoverableErrors.length > 0 && parseResult.symbols.length === 0) {
                continue;
            }
        }
        // Get the index hash for change detection
        const indexHash = parseResult.hash;
        // Group symbols by file
        const symbolsByFile = groupSymbolsByFile(parseResult.symbols);
        // Filter files if specific files were requested
        let filesToProcess;
        if (files && files.length > 0) {
            // Normalize requested files and filter to only those with symbols
            const normalizedFiles = new Set(files.map((f) => f.replace(/^\.\//, "").replace(/\\/g, "/")));
            filesToProcess = Array.from(symbolsByFile.keys()).filter((filePath) => {
                const normalizedPath = filePath.replace(/^\.\//, "").replace(/\\/g, "/");
                return normalizedFiles.has(normalizedPath);
            });
        }
        else {
            filesToProcess = Array.from(symbolsByFile.keys());
        }
        // Generate documentation for each file
        for (const filePath of filesToProcess) {
            const fileSymbols = symbolsByFile.get(filePath);
            if (!fileSymbols || fileSymbols.length === 0) {
                continue;
            }
            const docPath = generateDocPath(filePath);
            const absoluteDocPath = join(resolvedPath, docPath);
            // Check if regeneration is needed (unless force is true)
            if (!force) {
                const needsRegen = await needsRegeneration(absoluteDocPath, indexHash);
                if (!needsRegen) {
                    filesSkipped.push(filePath);
                    continue;
                }
            }
            // Filter relationships for this file
            const fileRelationships = filterRelationshipsForFile(parseResult.relationships, fileSymbols);
            // Generate documentation
            const generatedDoc = generateForFile(filePath, fileSymbols, fileRelationships);
            // Add index hash marker for change detection
            let finalContent = addIndexHashMarker(generatedDoc.content, indexHash);
            // Preserve manual sections if the doc file already exists
            if (await fileExists(absoluteDocPath)) {
                try {
                    const existingContent = await readFile(absoluteDocPath, "utf-8");
                    finalContent = preserveManualSections(existingContent, finalContent);
                }
                catch {
                    // If we can't read the existing file, just use the new content
                }
            }
            // Write the documentation file
            try {
                // Ensure the directory exists
                const docDir = dirname(absoluteDocPath);
                const { mkdir } = await import("node:fs/promises");
                await mkdir(docDir, { recursive: true });
                await writeFile(absoluteDocPath, finalContent, "utf-8");
                filesGenerated.push({
                    sourcePath: filePath,
                    docPath,
                    arn: generatedDoc.arn,
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to write ${docPath}: ${errorMessage}`);
            }
        }
    }
    // Determine overall success
    const success = filesGenerated.length > 0 || (errors.length === 0 && filesSkipped.length > 0);
    const output = {
        success,
        packagePath: resolvedPath,
        filesGenerated,
        filesSkipped,
    };
    if (errors.length > 0) {
        output.errors = errors;
    }
    return output;
}
//# sourceMappingURL=doc_generation.js.map