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
export function generate(components: ArnComponents): string {
  const { type, workspace, package: pkg, path, symbol } = components;

  const normalizedPath = normalizePath(path);
  const baseArn = `arn:archon:${type}:${workspace}/${pkg}/${normalizedPath}`;

  if (symbol !== undefined && symbol !== "") {
    const escapedSymbol = escapeSymbol(symbol);
    return `${baseArn}#${escapedSymbol}`;
  }

  return baseArn;
}

/**
 * Parse ARN string to components.
 * Returns null for invalid ARN format.
 *
 * Format: arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
 *
 * @param arn - The ARN string to parse
 * @returns The parsed ARN components, or null if invalid
 */
export function parse(arn: string): ArnComponents | null {
  if (!arn || typeof arn !== "string") {
    return null;
  }

  // ARN must start with "arn:archon:"
  const prefix = "arn:archon:";
  if (!arn.startsWith(prefix)) {
    return null;
  }

  // Remove prefix and get the rest
  const rest = arn.slice(prefix.length);

  // Split by first colon to get type and the resource path
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const type = rest.slice(0, colonIndex);

  // Validate type
  const validTypes = ["code", "doc", "k8s", "infra"];
  if (!validTypes.includes(type)) {
    return null;
  }

  // Get the resource path (everything after type:)
  const resourcePath = rest.slice(colonIndex + 1);
  if (!resourcePath) {
    return null;
  }

  // Split symbol from path (symbol is after #)
  let pathPart: string;
  let symbol: string | undefined;

  const hashIndex = resourcePath.indexOf("#");
  if (hashIndex !== -1) {
    pathPart = resourcePath.slice(0, hashIndex);
    const escapedSymbol = resourcePath.slice(hashIndex + 1);
    // Only set symbol if it's non-empty
    if (escapedSymbol) {
      symbol = unescapeSymbol(escapedSymbol);
    }
  } else {
    pathPart = resourcePath;
  }

  // Parse workspace/package/path from pathPart
  // Format: <workspace>/<package>/<path>
  // Path may contain multiple / characters, so we need to extract workspace and package first
  const firstSlash = pathPart.indexOf("/");
  if (firstSlash === -1) {
    return null;
  }

  const workspace = pathPart.slice(0, firstSlash);
  if (!workspace) {
    return null;
  }

  const afterWorkspace = pathPart.slice(firstSlash + 1);
  const secondSlash = afterWorkspace.indexOf("/");
  if (secondSlash === -1) {
    return null;
  }

  const pkg = afterWorkspace.slice(0, secondSlash);
  if (!pkg) {
    return null;
  }

  const path = afterWorkspace.slice(secondSlash + 1);
  if (!path) {
    return null;
  }

  return {
    type: type as ArnComponents["type"],
    workspace,
    package: pkg,
    path,
    symbol,
  };
}

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
export function validate(arn: string): ArnValidationResult {
  // Check for non-empty string
  if (!arn || typeof arn !== "string") {
    return { valid: false, error: "ARN must be a non-empty string" };
  }

  // Check prefix
  const prefix = "arn:archon:";
  if (!arn.startsWith(prefix)) {
    return { valid: false, error: "ARN must start with 'arn:archon:'" };
  }

  // Remove prefix and get the rest
  const rest = arn.slice(prefix.length);

  // Split by first colon to get type and the resource path
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    return { valid: false, error: "ARN is missing type separator ':'" };
  }

  const type = rest.slice(0, colonIndex);

  // Validate type
  const validTypes = ["code", "doc", "k8s", "infra"];
  if (!type) {
    return { valid: false, error: "ARN is missing type component" };
  }
  if (!validTypes.includes(type)) {
    return {
      valid: false,
      error: `Invalid ARN type: ${type}. Valid types are: code, doc, k8s, infra`,
    };
  }

  // Get the resource path (everything after type:)
  const resourcePath = rest.slice(colonIndex + 1);
  if (!resourcePath) {
    return { valid: false, error: "ARN is missing resource path" };
  }

  // Split symbol from path (symbol is after #)
  let pathPart: string;
  const hashIndex = resourcePath.indexOf("#");
  if (hashIndex !== -1) {
    pathPart = resourcePath.slice(0, hashIndex);
  } else {
    pathPart = resourcePath;
  }

  // Parse workspace/package/path from pathPart
  // Format: <workspace>/<package>/<path>
  const firstSlash = pathPart.indexOf("/");
  if (firstSlash === -1) {
    return { valid: false, error: "Missing workspace component" };
  }

  const workspace = pathPart.slice(0, firstSlash);
  if (!workspace) {
    return { valid: false, error: "Missing workspace component" };
  }

  const afterWorkspace = pathPart.slice(firstSlash + 1);
  const secondSlash = afterWorkspace.indexOf("/");
  if (secondSlash === -1) {
    return { valid: false, error: "Missing package component" };
  }

  const pkg = afterWorkspace.slice(0, secondSlash);
  if (!pkg) {
    return { valid: false, error: "Missing package component" };
  }

  const path = afterWorkspace.slice(secondSlash + 1);
  if (!path) {
    return { valid: false, error: "Missing path component" };
  }

  return { valid: true };
}

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
export function normalizePath(path: string): string {
  // Handle empty or falsy paths
  if (!path) {
    return "";
  }

  // Normalize path separators: convert backslashes to forward slashes (Windows compatibility)
  let normalized = path.replace(/\\/g, "/");

  // Remove redundant slashes (e.g., `//` -> `/`)
  normalized = normalized.replace(/\/+/g, "/");

  // Remove leading ./
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  // Handle path that is just "."
  if (normalized === ".") {
    return "";
  }

  // Split into segments and resolve .. segments
  const segments = normalized.split("/");
  const resolvedSegments: string[] = [];

  for (const segment of segments) {
    if (segment === "..") {
      // Go up one directory if possible
      // If we have segments to pop, pop them
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
      // If no segments to pop, we're at root - drop the .. segment
      // (don't allow .. to go above the root)
    } else if (segment !== "." && segment !== "") {
      // Skip empty segments (from redundant slashes) and single dots
      resolvedSegments.push(segment);
    }
  }

  return resolvedSegments.join("/");
}

/**
 * Escape special characters in symbol for ARN encoding.
 * Escapes: / → %2F, # → %23, % → %25
 *
 * Note: % must be escaped first to avoid double-escaping.
 *
 * @param symbol - The symbol to escape
 * @returns The escaped symbol
 */
export function escapeSymbol(symbol: string): string {
  if (!symbol) {
    return symbol;
  }

  // Order matters: escape % first to avoid double-escaping
  return symbol
    .replace(/%/g, "%25")
    .replace(/\//g, "%2F")
    .replace(/#/g, "%23");
}

/**
 * Unescape symbol from ARN encoding.
 * Unescapes: %2F → /, %23 → #, %25 → %
 *
 * Note: % must be unescaped last to avoid incorrect unescaping.
 *
 * @param escaped - The escaped symbol to unescape
 * @returns The unescaped symbol
 */
export function unescapeSymbol(escaped: string): string {
  if (!escaped) {
    return escaped;
  }

  // Order matters: unescape % last to avoid incorrect unescaping
  return escaped
    .replace(/%2F/g, "/")
    .replace(/%23/g, "#")
    .replace(/%25/g, "%");
}
