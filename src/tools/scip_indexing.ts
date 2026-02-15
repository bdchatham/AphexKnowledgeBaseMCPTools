/**
 * SCIP Indexing Tool
 *
 * MCP tool that generates SCIP indexes for packages by detecting languages
 * and invoking appropriate SCIP tools (scip-go, scip-typescript).
 */

import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { detect } from "../lib/language_detector.js";
import type {
  DetectedLanguage,
  GenerateScipIndexInput,
  GenerateScipIndexOutput,
  IndexResult,
} from "../types/tools.js";

const execAsync = promisify(exec);

/**
 * Check if a command is available in the system PATH.
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const checkCommand =
      process.platform === "win32" ? `where ${command}` : `which ${command}`;
    await execAsync(checkCommand);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute SHA-256 hash of a file's contents.
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Ensure the .archon/scip directory exists for a package.
 */
async function ensureScipDirectory(packagePath: string): Promise<string> {
  const scipDir = join(packagePath, ".archon", "scip");
  await mkdir(scipDir, { recursive: true });
  return scipDir;
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Count symbols in a SCIP index file.
 * This is a simplified count based on file size as a proxy.
 * A proper implementation would parse the protobuf content.
 */
async function countSymbolsInIndex(indexPath: string): Promise<number> {
  try {
    const stats = await stat(indexPath);
    // Rough estimate: ~100 bytes per symbol on average
    return Math.max(1, Math.floor(stats.size / 100));
  } catch {
    return 0;
  }
}

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
export async function readScipMetadata(
  packagePath: string
): Promise<ScipMetadata | null> {
  const metadataPath = join(packagePath, ".archon", "scip", "metadata.json");

  try {
    const content = await readFile(metadataPath, "utf-8");
    return JSON.parse(content) as ScipMetadata;
  } catch {
    return null;
  }
}

/**
 * Write metadata.json to the .archon/scip/ directory.
 *
 * @param packagePath - Path to the package
 * @param metadata - Metadata to write
 */
async function writeScipMetadata(
  packagePath: string,
  metadata: ScipMetadata
): Promise<void> {
  const metadataPath = join(packagePath, ".archon", "scip", "metadata.json");
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

/**
 * Get installation instructions for a SCIP tool.
 */
function getInstallationInstructions(tool: "scip-go" | "scip-typescript"): string {
  if (tool === "scip-go") {
    return `scip-go is not installed. Install it with:
  go install github.com/sourcegraph/scip-go/cmd/scip-go@latest

Make sure $GOPATH/bin is in your PATH.`;
  }
  return `scip-typescript is not installed. Install it with:
  npm install -g @sourcegraph/scip-typescript

Or add it as a dev dependency:
  npm install --save-dev @sourcegraph/scip-typescript`;
}

/**
 * Invoke scip-go to generate a SCIP index for a Go package.
 */
async function invokeScipGo(
  packagePath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  const isAvailable = await isCommandAvailable("scip-go");
  if (!isAvailable) {
    return {
      success: false,
      error: getInstallationInstructions("scip-go"),
    };
  }

  try {
    // scip-go generates index.scip in the current directory by default
    // We use --output to specify the output path
    await execAsync(`scip-go --output "${outputPath}"`, {
      cwd: packagePath,
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `scip-go failed: ${errorMessage}`,
    };
  }
}

/**
 * Invoke scip-typescript to generate a SCIP index for a TypeScript package.
 */
async function invokeScipTypeScript(
  packagePath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  // Check for both possible command names
  let command = "scip-typescript";
  let isAvailable = await isCommandAvailable(command);

  if (!isAvailable) {
    // Try npx as fallback
    command = "npx scip-typescript";
    try {
      await execAsync("npx scip-typescript --help", { cwd: packagePath });
      isAvailable = true;
    } catch {
      isAvailable = false;
    }
  }

  if (!isAvailable) {
    return {
      success: false,
      error: getInstallationInstructions("scip-typescript"),
    };
  }

  try {
    // scip-typescript index command generates the SCIP index
    await execAsync(`${command} index --output "${outputPath}"`, {
      cwd: packagePath,
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `scip-typescript failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate SCIP indexes for a package by detecting languages and invoking
 * appropriate SCIP tools.
 *
 * @param input - The input parameters for SCIP index generation
 * @returns The result of the indexing operation
 */
export async function generateScipIndex(
  input: GenerateScipIndexInput
): Promise<GenerateScipIndexOutput> {
  const { packagePath, force = false } = input;
  const resolvedPath = resolve(packagePath);

  const errors: string[] = [];
  const indexes: IndexResult[] = [];
  const languagesDetected: DetectedLanguage[] = [];

  // Detect languages in the package
  const detection = await detect(resolvedPath);

  if (!detection.hasGo && !detection.hasTypeScript) {
    // No supported languages detected - return success with empty results
    return {
      success: true,
      packagePath: resolvedPath,
      languagesDetected: [],
      indexes: [],
    };
  }

  // Ensure the .archon/scip directory exists
  const scipDir = await ensureScipDirectory(resolvedPath);

  // Determine index file names based on whether multiple languages are present
  const isMultiLanguage = detection.hasGo && detection.hasTypeScript;

  // Process Go if detected
  if (detection.hasGo) {
    languagesDetected.push("go");
    const indexFileName = isMultiLanguage ? "index.go.scip" : "index.scip";
    const indexPath = join(scipDir, indexFileName);

    // Check if we need to regenerate (force or file doesn't exist)
    const needsGeneration = force || !(await fileExists(indexPath));

    if (needsGeneration) {
      const result = await invokeScipGo(resolvedPath, indexPath);

      if (result.success && (await fileExists(indexPath))) {
        const hash = await computeFileHash(indexPath);
        const symbolCount = await countSymbolsInIndex(indexPath);

        indexes.push({
          language: "go",
          indexPath,
          symbolCount,
          hash,
        });
      } else if (result.error) {
        errors.push(result.error);
      }
    } else {
      // File exists and force is false - use existing index
      const hash = await computeFileHash(indexPath);
      const symbolCount = await countSymbolsInIndex(indexPath);

      indexes.push({
        language: "go",
        indexPath,
        symbolCount,
        hash,
      });
    }
  }

  // Process TypeScript if detected
  if (detection.hasTypeScript) {
    languagesDetected.push("typescript");
    const indexFileName = isMultiLanguage ? "index.ts.scip" : "index.scip";
    const indexPath = join(scipDir, indexFileName);

    // Check if we need to regenerate (force or file doesn't exist)
    const needsGeneration = force || !(await fileExists(indexPath));

    if (needsGeneration) {
      const result = await invokeScipTypeScript(resolvedPath, indexPath);

      if (result.success && (await fileExists(indexPath))) {
        const hash = await computeFileHash(indexPath);
        const symbolCount = await countSymbolsInIndex(indexPath);

        indexes.push({
          language: "typescript",
          indexPath,
          symbolCount,
          hash,
        });
      } else if (result.error) {
        errors.push(result.error);
      }
    } else {
      // File exists and force is false - use existing index
      const hash = await computeFileHash(indexPath);
      const symbolCount = await countSymbolsInIndex(indexPath);

      indexes.push({
        language: "typescript",
        indexPath,
        symbolCount,
        hash,
      });
    }
  }

  // Determine overall success - success if at least one index was generated
  // or if there were no errors (e.g., existing indexes were reused)
  const success = indexes.length > 0 || errors.length === 0;

  // Write metadata.json for change tracking (Requirement 1.9, 6.5)
  if (indexes.length > 0) {
    const metadata: ScipMetadata = {
      packagePath: resolvedPath,
      lastIndexed: new Date().toISOString(),
      indexes: indexes.map((idx) => ({
        language: idx.language,
        indexFile: idx.indexPath.replace(resolvedPath + "/", "").replace(resolvedPath + "\\", ""),
        hash: idx.hash,
        symbolCount: idx.symbolCount,
      })),
    };
    await writeScipMetadata(resolvedPath, metadata);
  }

  const output: GenerateScipIndexOutput = {
    success,
    packagePath: resolvedPath,
    languagesDetected,
    indexes,
  };

  if (errors.length > 0) {
    output.errors = errors;
  }

  return output;
}
