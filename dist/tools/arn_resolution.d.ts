/**
 * ARN Resolution Tool
 *
 * MCP tool that resolves ARNs to file locations and symbol information.
 * Parses and validates ARNs using the ARN library and resolves:
 * - Code ARNs to source files with line numbers using SCIP index data
 * - Doc ARNs to .archon.md documentation files co-located with source
 */
import type { ResolveArnInput, ResolveArnOutput } from "../types/tools.js";
/**
 * Options for ARN resolution that can be provided externally.
 */
export interface ResolveArnOptions {
    /** Base path for workspace resolution. Defaults to current working directory. */
    workspaceBasePath?: string;
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
export declare function convertToArchonDocPath(sourcePath: string): string;
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
export declare function resolveArn(input: ResolveArnInput, options?: ResolveArnOptions): Promise<ResolveArnOutput>;
//# sourceMappingURL=arn_resolution.d.ts.map