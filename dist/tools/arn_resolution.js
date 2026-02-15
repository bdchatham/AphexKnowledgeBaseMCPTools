/**
 * ARN Resolution Tool
 *
 * MCP tool that resolves ARNs to file locations and symbol information.
 * Parses and validates ARNs using the ARN library and resolves:
 * - Code ARNs to source files with line numbers using SCIP index data
 * - Doc ARNs to .archon.md documentation files co-located with source
 */
import { existsSync } from "fs";
import { join, resolve as resolvePath } from "path";
import { parse, validate } from "../lib/arn.js";
import { parse as parseScipIndex } from "../lib/scip_parser.js";
/**
 * Resolve a code ARN to its source file location and line number.
 *
 * For code ARNs:
 * 1. Constructs the full file path from workspace/package/path
 * 2. Looks up the symbol in the SCIP index to get line number (if symbol is provided)
 * 3. Returns the absolute file path and line number
 *
 * @param parsed - The parsed ARN components
 * @param workspaceBasePath - Base path for workspace resolution
 * @returns Object with filePath and optional lineNumber, or error
 */
async function resolveCodeArn(parsed, workspaceBasePath) {
    // Construct the full file path: workspaceBasePath/package/path
    // The workspace component is used for logical grouping but the actual file
    // is located at workspaceBasePath/package/path
    const fullFilePath = resolvePath(workspaceBasePath, parsed.package, parsed.path);
    // Check if the file exists
    if (!existsSync(fullFilePath)) {
        return {
            filePath: fullFilePath,
            error: `File not found: ${fullFilePath}`,
        };
    }
    // If no symbol is specified, return just the file path
    if (!parsed.symbol) {
        return { filePath: fullFilePath };
    }
    // Try to look up the symbol in the SCIP index to get line number
    const lineNumber = await lookupSymbolLineNumber(parsed.package, parsed.path, parsed.symbol, workspaceBasePath);
    return {
        filePath: fullFilePath,
        lineNumber,
    };
}
/**
 * Resolve a doc ARN to its .archon.md file location.
 *
 * For doc ARNs:
 * 1. Constructs the full file path from workspace/package/path
 * 2. Converts the source path to the corresponding .archon.md path
 * 3. Returns the absolute file path to the documentation file
 *
 * Documentation files follow the naming convention: <name>.archon.md
 * For example: src/lib/arn.ts -> src/lib/arn.archon.md
 *
 * @param parsed - The parsed ARN components
 * @param workspaceBasePath - Base path for workspace resolution
 * @returns Object with filePath, or error
 */
async function resolveDocArn(parsed, workspaceBasePath) {
    // Convert the path to the .archon.md documentation file path
    // Documentation files are co-located with source files as <name>.archon.md
    // For example: src/lib/arn.ts -> src/lib/arn.archon.md
    const docPath = convertToArchonDocPath(parsed.path);
    // Construct the full file path: workspaceBasePath/package/docPath
    const fullFilePath = resolvePath(workspaceBasePath, parsed.package, docPath);
    // Check if the documentation file exists
    if (!existsSync(fullFilePath)) {
        return {
            filePath: fullFilePath,
            error: `Documentation file not found: ${fullFilePath}`,
        };
    }
    return { filePath: fullFilePath };
}
/**
 * Convert a source file path to its corresponding .archon.md documentation path.
 *
 * The conversion follows the naming convention:
 * - <name>.<ext> -> <name>.archon.md
 * - <name> (no extension) -> <name>.archon.md
 *
 * If the path already ends with .archon.md, it is returned unchanged.
 *
 * @param sourcePath - The source file path
 * @returns The corresponding .archon.md documentation path
 */
export function convertToArchonDocPath(sourcePath) {
    // If already an .archon.md path, return as-is
    if (sourcePath.endsWith(".archon.md")) {
        return sourcePath;
    }
    // Find the last dot to identify the extension
    const lastDotIndex = sourcePath.lastIndexOf(".");
    const lastSlashIndex = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
    // If there's a dot after the last slash (i.e., it's a file extension)
    if (lastDotIndex > lastSlashIndex && lastDotIndex !== -1) {
        // Replace the extension with .archon.md
        return sourcePath.substring(0, lastDotIndex) + ".archon.md";
    }
    // No extension found, just append .archon.md
    return sourcePath + ".archon.md";
}
/**
 * Look up a symbol's line number from the SCIP index.
 *
 * Searches the SCIP index for the package to find the symbol's location.
 * Returns undefined if the symbol is not found or the index doesn't exist.
 *
 * @param packageName - The package name
 * @param filePath - The file path relative to the package
 * @param symbolName - The symbol name to look up
 * @param workspaceBasePath - Base path for workspace resolution
 * @returns The line number if found, undefined otherwise
 */
async function lookupSymbolLineNumber(packageName, filePath, symbolName, workspaceBasePath) {
    // Determine the SCIP index path
    // SCIP indexes are stored at <package>/.archon/scip/index.scip
    const packagePath = join(workspaceBasePath, packageName);
    const scipIndexPath = join(packagePath, ".archon", "scip", "index.scip");
    // Check if the SCIP index exists
    if (!existsSync(scipIndexPath)) {
        // Try language-specific indexes
        const tsIndexPath = join(packagePath, ".archon", "scip", "index.ts.scip");
        const goIndexPath = join(packagePath, ".archon", "scip", "index.go.scip");
        // Determine which index to use based on file extension
        let indexPath;
        if (filePath.endsWith(".ts") || filePath.endsWith(".js") || filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
            if (existsSync(tsIndexPath)) {
                indexPath = tsIndexPath;
            }
        }
        else if (filePath.endsWith(".go")) {
            if (existsSync(goIndexPath)) {
                indexPath = goIndexPath;
            }
        }
        if (!indexPath) {
            // No SCIP index available
            return undefined;
        }
        return await searchScipIndexForSymbol(indexPath, filePath, symbolName, packageName);
    }
    return await searchScipIndexForSymbol(scipIndexPath, filePath, symbolName, packageName);
}
/**
 * Search a SCIP index file for a symbol and return its line number.
 *
 * @param indexPath - Path to the SCIP index file
 * @param filePath - The file path relative to the package
 * @param symbolName - The symbol name to look up
 * @param packageName - The package name for ARN generation
 * @returns The line number if found, undefined otherwise
 */
async function searchScipIndexForSymbol(indexPath, filePath, symbolName, packageName) {
    try {
        // Parse the SCIP index
        // Use a placeholder workspace name since we're just looking up symbols
        const parseResult = await parseScipIndex(indexPath, "workspace", packageName);
        // Search for the symbol in the parsed results
        for (const symbol of parseResult.symbols) {
            // Match by symbol name and file path
            if (symbol.name === symbolName && symbol.location.file === filePath) {
                return symbol.location.line;
            }
        }
        // If exact match not found, try matching just by symbol name
        // (useful when the file path in the index might be slightly different)
        for (const symbol of parseResult.symbols) {
            if (symbol.name === symbolName) {
                return symbol.location.line;
            }
        }
        // Symbol not found in index
        return undefined;
    }
    catch {
        // Failed to parse SCIP index - return undefined
        return undefined;
    }
}
/**
 * Resolve an ARN to its file location and symbol information.
 *
 * This tool:
 * 1. Validates the ARN format using the ARN library
 * 2. Parses the ARN to extract components (type, workspace, package, path, symbol)
 * 3. For code ARNs, constructs the full file path and looks up line numbers
 * 4. Returns the resolved components for navigation
 *
 * @param input - The input containing the ARN to resolve
 * @param options - Optional configuration for resolution
 * @returns The resolution result with parsed components or error
 */
export async function resolveArn(input, options) {
    const { arn } = input;
    const workspaceBasePath = options?.workspaceBasePath ?? process.cwd();
    // Validate the ARN format using the ARN library (Requirement 5.2)
    const validationResult = validate(arn);
    if (!validationResult.valid) {
        return {
            success: false,
            arn,
            resolved: null,
            error: validationResult.error ?? "Invalid ARN format",
        };
    }
    // Parse the ARN to extract components (Requirement 5.2)
    const parsed = parse(arn);
    if (!parsed) {
        return {
            success: false,
            arn,
            resolved: null,
            error: "Failed to parse ARN components",
        };
    }
    // Handle code ARN resolution (Requirement 5.3, 5.5)
    if (parsed.type === "code") {
        const codeResolution = await resolveCodeArn(parsed, workspaceBasePath);
        if (codeResolution.error) {
            return {
                success: false,
                arn,
                resolved: null,
                error: codeResolution.error,
            };
        }
        const resolved = {
            type: parsed.type,
            workspace: parsed.workspace,
            package: parsed.package,
            path: parsed.path,
            symbol: parsed.symbol,
            filePath: codeResolution.filePath,
            lineNumber: codeResolution.lineNumber,
        };
        return {
            success: true,
            arn,
            resolved,
        };
    }
    // Handle doc ARN resolution (Requirement 5.5)
    if (parsed.type === "doc") {
        const docResolution = await resolveDocArn(parsed, workspaceBasePath);
        if (docResolution.error) {
            return {
                success: false,
                arn,
                resolved: null,
                error: docResolution.error,
            };
        }
        const resolved = {
            type: parsed.type,
            workspace: parsed.workspace,
            package: parsed.package,
            path: parsed.path,
            symbol: parsed.symbol,
            filePath: docResolution.filePath,
            lineNumber: undefined, // Doc files don't have line numbers for symbols
        };
        return {
            success: true,
            arn,
            resolved,
        };
    }
    // For non-code/non-doc ARN types (k8s, infra), return basic resolution
    // These types may be implemented in future tasks
    const resolved = {
        type: parsed.type,
        workspace: parsed.workspace,
        package: parsed.package,
        path: parsed.path,
        symbol: parsed.symbol,
        filePath: parsed.path, // Placeholder for k8s/infra types
        lineNumber: undefined,
    };
    return {
        success: true,
        arn,
        resolved,
    };
}
//# sourceMappingURL=arn_resolution.js.map