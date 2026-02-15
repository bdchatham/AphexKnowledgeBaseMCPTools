/**
 * SCIP Indexing Tool
 *
 * MCP tool that generates SCIP indexes for packages by detecting languages
 * and invoking appropriate SCIP tools (scip-go, scip-typescript).
 */
import type { GenerateScipIndexInput, GenerateScipIndexOutput } from "../types/tools.js";
/**
 * Metadata stored for SCIP indexes.
 * Used for change detection at the workspace level.
 */
export interface ScipMetadata {
    packagePath: string;
    lastIndexed: string;
    indexes: {
        language: "go" | "typescript";
        indexFile: string;
        hash: string;
        symbolCount: number;
    }[];
}
/**
 * Read the metadata.json file from the .archon/scip/ directory.
 *
 * @param packagePath - Path to the package
 * @returns Metadata object or null if not found
 */
export declare function readScipMetadata(packagePath: string): Promise<ScipMetadata | null>;
/**
 * Generate SCIP indexes for a package by detecting languages and invoking
 * appropriate SCIP tools.
 *
 * @param input - The input parameters for SCIP index generation
 * @returns The result of the indexing operation
 */
export declare function generateScipIndex(input: GenerateScipIndexInput): Promise<GenerateScipIndexOutput>;
//# sourceMappingURL=scip_indexing.d.ts.map