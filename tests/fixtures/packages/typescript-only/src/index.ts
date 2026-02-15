/**
 * TypeScript-only test fixture package
 *
 * This module provides the main entry point for the typescript-only fixture.
 */

export { formatName, validateInput, maxNumber } from "./utils.js";

/**
 * Application configuration interface.
 */
export interface Config {
  name: string;
  debug: boolean;
  timeout: number;
}

/**
 * Creates a new configuration with default values.
 */
export function createConfig(): Config {
  return {
    name: "typescript-only",
    debug: false,
    timeout: 30,
  };
}

/**
 * Application version constant.
 */
export const VERSION = "1.0.0";
