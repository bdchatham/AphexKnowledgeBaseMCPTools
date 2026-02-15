/**
 * Core package - nested TypeScript package at depth 2.
 */

export const CORE_VERSION = "1.0.0";

export interface CoreConfig {
  enabled: boolean;
}

export function coreFunction(): string {
  return "core";
}
