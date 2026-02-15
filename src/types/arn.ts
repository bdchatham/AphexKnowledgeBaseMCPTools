/**
 * ARN Type Definitions
 *
 * Types for Archon Resource Names (ARNs) used throughout the system.
 * ARN format: arn:archon:<type>:<workspace>/<package>/<path>#<symbol>
 */

/**
 * Valid ARN type values.
 * - code: Source code files and symbols
 * - doc: Documentation files (.archon.md)
 * - k8s: Kubernetes resources
 * - infra: Infrastructure definitions (CDK, Terraform, etc.)
 */
export type ArnType = "code" | "doc" | "k8s" | "infra";

/**
 * Components that make up an ARN.
 * Used for generating and parsing ARNs.
 */
export interface ArnComponents {
  /** Resource type (code, doc, k8s, infra) */
  type: ArnType;
  /** Workspace identifier */
  workspace: string;
  /** Package/repository name */
  package: string;
  /** File path relative to package root */
  path: string;
  /** Symbol name within the file (optional) */
  symbol?: string;
}

/**
 * Result of ARN validation.
 */
export interface ArnValidationResult {
  /** Whether the ARN is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}
