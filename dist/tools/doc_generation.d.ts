/**
 * Documentation Generation Tool
 *
 * MCP tool that generates plain English documentation from SCIP indexes.
 * Creates .archon.md files co-located with source files.
 */
import type { GenerateArchonDocInput, GenerateArchonDocOutput } from "../types/tools.js";
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
export declare function generateArchonDoc(input: GenerateArchonDocInput): Promise<GenerateArchonDocOutput>;
//# sourceMappingURL=doc_generation.d.ts.map