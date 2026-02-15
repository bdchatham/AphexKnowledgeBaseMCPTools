/**
 * Tool Input/Output Type Definitions
 *
 * Types for MCP tool inputs and outputs.
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */

import type { SymbolKind } from "./scip.js";

export type DetectedLanguage = "go" | "typescript";

// ============================================================================
// Documentation Generator Types
// ============================================================================

/**
 * Template for generating documentation based on symbol kind.
 * Different symbol kinds (function, class, method, module) use different templates
 * to produce appropriate documentation structure.
 */
export interface DocTemplate {
  /** The symbol kind this template applies to */
  kind: SymbolKind;
  /** The template string with placeholders for symbol information */
  template: string;
}

/**
 * Result of generating documentation for a source file.
 * Contains the generated content and ARN references for cross-linking.
 */
export interface GeneratedDoc {
  /** Path to the source file that was documented */
  sourcePath: string;
  /** Path to the generated documentation file (<name>.archon.md) */
  docPath: string;
  /** Generated documentation content in Markdown format */
  content: string;
  /** ARN for this documentation file */
  arn: string;
  /** ARNs of symbols referenced in this documentation */
  referencedArns: string[];
}

/**
 * Represents a manually-edited section within an Archon documentation file.
 * Manual sections are preserved during documentation regeneration.
 * Marked with <!-- archon:manual --> and <!-- /archon:manual --> markers.
 */
export interface ManualSection {
  /** The opening marker (e.g., "<!-- archon:manual -->") */
  startMarker: string;
  /** The closing marker (e.g., "<!-- /archon:manual -->") */
  endMarker: string;
  /** The content between the markers to be preserved */
  content: string;
}

// ============================================================================
// Language Detection Types
// ============================================================================

/**
 * Result of language detection for a package directory.
 * Identifies which programming languages are present and their root locations.
 */
export interface LanguageDetectionResult {
  /** Whether Go code was detected (via go.mod or .go files) */
  hasGo: boolean;
  /** Whether TypeScript/JavaScript code was detected (via package.json or .ts/.js files) */
  hasTypeScript: boolean;
  /** Path to Go module root (directory containing go.mod or .go files), if detected */
  goRoot?: string;
  /** Path to TypeScript/JavaScript root (directory containing package.json or .ts/.js files), if detected */
  tsRoot?: string;
}

export interface GenerateScipIndexInput {
  packagePath: string;
  force?: boolean;
}

export interface IndexResult {
  language: DetectedLanguage;
  indexPath: string;
  symbolCount: number;
  hash: string;
}

export interface GenerateScipIndexOutput {
  success: boolean;
  packagePath: string;
  languagesDetected: DetectedLanguage[];
  indexes: IndexResult[];
  errors?: string[];
}

export interface GenerateArchonDocInput {
  packagePath: string;
  files?: string[];
  force?: boolean;
}

export interface GeneratedFileInfo {
  sourcePath: string;
  docPath: string;
  arn: string;
}

export interface GenerateArchonDocOutput {
  success: boolean;
  packagePath: string;
  filesGenerated: GeneratedFileInfo[];
  filesSkipped: string[];
  errors?: string[];
}

export interface ResolveArnInput {
  arn: string;
}

export interface ResolvedArn {
  type: "code" | "doc" | "k8s" | "infra";
  workspace: string;
  package: string;
  path: string;
  symbol?: string;
  filePath: string;
  lineNumber?: number;
}

export interface ResolveArnOutput {
  success: boolean;
  arn: string;
  resolved: ResolvedArn | null;
  error?: string;
}

export interface IndexWorkspaceInput {
  workspacePath: string;
  packages?: string[];
  force?: boolean;
}

export interface PackageIndexResult {
  package: string;
  languages: DetectedLanguage[];
  symbolCount: number;
}

export interface PackageError {
  package: string;
  error: string;
}

export interface IndexWorkspaceOutput {
  success: boolean;
  workspacePath: string;
  packagesIndexed: PackageIndexResult[];
  packagesSkipped: string[];
  totalSymbols: number;
  errors: PackageError[];
}

export interface DocumentWorkspaceInput {
  workspacePath: string;
  packages?: string[];
  force?: boolean;
}

export interface PackageDocResult {
  package: string;
  filesGenerated: number;
  arnsCreated: string[];
}

export interface DocumentWorkspaceOutput {
  success: boolean;
  workspacePath: string;
  packagesDocumented: PackageDocResult[];
  packagesSkipped: string[];
  totalFilesGenerated: number;
  totalArns: number;
  errors: PackageError[];
}

// ============================================================================
// Knowledge Base Sync Types
// ============================================================================

/**
 * Input for the sync_to_knowledge_base MCP tool.
 * Orchestrates synchronization of SCIP indexes and Archon documentation
 * to the Knowledge Base (Code Graph and Vector Store).
 */
export interface SyncToKnowledgeBaseInput {
  /** Path to the workspace root */
  workspacePath: string;
  /** Optional: specific packages to sync */
  packages?: string[];
  /** Force sync regardless of change status */
  force?: boolean;
}

/**
 * Summary of a single package sync operation.
 */
export interface PackageSyncSummary {
  /** Package name */
  package: string;
  /** Number of new nodes created in Code Graph */
  nodesCreated: number;
  /** Number of existing nodes updated in Code Graph */
  nodesUpdated: number;
  /** Number of edges created in Code Graph */
  edgesCreated: number;
  /** Number of chunks upserted to Vector Store */
  chunksUpserted: number;
  /** Number of stale nodes pruned from Code Graph */
  nodesPruned: number;
  /** Number of stale chunks pruned from Vector Store */
  chunksPruned: number;
}

/**
 * Output from the sync_to_knowledge_base MCP tool.
 */
export interface SyncToKnowledgeBaseOutput {
  /** Whether the overall sync operation succeeded */
  success: boolean;
  /** Path to the workspace that was synced */
  workspacePath: string;
  /** Summary of packages that were synced */
  packagesSynced: PackageSyncSummary[];
  /** Names of packages that were skipped (unchanged) */
  packagesSkipped: string[];
  /** Total number of nodes created across all packages */
  totalNodesCreated: number;
  /** Total number of chunks upserted across all packages */
  totalChunksUpserted: number;
  /** Errors encountered during sync */
  errors: PackageError[];
}
