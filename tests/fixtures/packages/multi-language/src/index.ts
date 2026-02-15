/**
 * Multi-language test fixture - TypeScript component
 *
 * This module provides the TypeScript entry point for the multi-language fixture.
 */

/**
 * TypeScript component version.
 */
export const TS_VERSION = "1.0.0";

/**
 * Processes data using TypeScript.
 * @param data - The data to process
 * @returns The processed data
 */
export function processData(data: string): string {
  return `TypeScript processed: ${data}`;
}

/**
 * Configuration for the multi-language package.
 */
export interface MultiLangConfig {
  useGo: boolean;
  useTypeScript: boolean;
}
