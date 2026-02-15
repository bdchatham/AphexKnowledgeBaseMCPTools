/**
 * Utility functions for the typescript-only test fixture.
 */

/**
 * Formats a name by trimming whitespace.
 * @param name - The name to format
 * @returns The formatted name
 */
export function formatName(name: string): string {
  return name.trim();
}

/**
 * Validates that the input string is non-empty.
 * @param input - The input to validate
 * @returns True if the input is valid
 */
export function validateInput(input: string): boolean {
  return input.trim().length > 0;
}

/**
 * Returns the larger of two numbers.
 * @param a - First number
 * @param b - Second number
 * @returns The larger number
 */
export function maxNumber(a: number, b: number): number {
  return a > b ? a : b;
}

/**
 * Type representing a result that can be either success or failure.
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
