/**
 * ARN Generation and Parsing Library
 *
 * Provides utilities for generating, parsing, and validating Archon Resource Names (ARNs).
 * ARN format: arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
 */
import type { ArnComponents, ArnValidationResult } from "../types/arn.js";
/**
 * Generate ARN string from components.
 * Deterministic: same inputs always produce same output.
 *
 * Format: arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
 *
 * @param components - The ARN components to generate from
 * @returns The generated ARN string
 */
export declare function generate(components: ArnComponents): string;
/**
 * Parse ARN string to components.
 * Returns null for invalid ARN format.
 *
 * Format: arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
 *
 * @param arn - The ARN string to parse
 * @returns The parsed ARN components, or null if invalid
 */
export declare function parse(arn: string): ArnComponents | null;
/**
 * Validate ARN format and return detailed error if invalid.
 *
 * Validates:
 * - ARN is a non-empty string
 * - ARN starts with "arn:archon:"
 * - Type is valid (code, doc, k8s, infra)
 * - All required components are present (workspace, package, path)
 *
 * @param arn - The ARN string to validate
 * @returns Validation result with valid flag and optional error message
 */
export declare function validate(arn: string): ArnValidationResult;
/**
 * Normalize path component by removing ./ and resolving ..
 *
 * Normalization rules:
 * - Convert backslashes to forward slashes (Windows compatibility)
 * - Remove leading `./`
 * - Resolve `..` segments (going up directories)
 * - Remove redundant slashes (e.g., `//` -> `/`)
 * - Handle edge cases: empty paths, paths with only `.` or `..`
 * - Don't allow `..` to go above the root (leading `..` segments are dropped)
 *
 * @param path - The path to normalize
 * @returns The normalized path
 */
export declare function normalizePath(path: string): string;
/**
 * Escape special characters in symbol for ARN encoding.
 * Escapes: / → %2F, # → %23, % → %25
 *
 * Note: % must be escaped first to avoid double-escaping.
 *
 * @param symbol - The symbol to escape
 * @returns The escaped symbol
 */
export declare function escapeSymbol(symbol: string): string;
/**
 * Unescape symbol from ARN encoding.
 * Unescapes: %2F → /, %23 → #, %25 → %
 *
 * Note: % must be unescaped last to avoid incorrect unescaping.
 *
 * @param escaped - The escaped symbol to unescape
 * @returns The unescaped symbol
 */
export declare function unescapeSymbol(escaped: string): string;
//# sourceMappingURL=arn.d.ts.map