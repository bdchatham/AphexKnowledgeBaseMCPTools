/**
 * Language Detector
 *
 * Detects the presence of Go and TypeScript/JavaScript code in a package
 * by examining file markers (go.mod, package.json, file extensions).
 */

import { readdir, stat, access } from "node:fs/promises";
import { join } from "node:path";

export interface LanguageDetectionResult {
  hasGo: boolean;
  hasTypeScript: boolean;
  goRoot?: string;
  tsRoot?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findFilesWithExtensions(
  directoryPath: string,
  extensions: string[]
): Promise<string[]> {
  const matchingFiles: string[] = [];

  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const hasMatchingExtension = extensions.some((ext) =>
          entry.name.endsWith(ext)
        );
        if (hasMatchingExtension) {
          matchingFiles.push(join(directoryPath, entry.name));
        }
      }
    }
  } catch {
    return [];
  }

  return matchingFiles;
}

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    const stats = await stat(directoryPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function detect(
  packagePath: string
): Promise<LanguageDetectionResult> {
  const result: LanguageDetectionResult = {
    hasGo: false,
    hasTypeScript: false,
  };

  const isValidDirectory = await isDirectory(packagePath);
  if (!isValidDirectory) {
    return result;
  }

  const goModPath = join(packagePath, "go.mod");
  const hasGoMod = await fileExists(goModPath);

  if (hasGoMod) {
    result.hasGo = true;
    result.goRoot = packagePath;
  } else {
    const goFiles = await findFilesWithExtensions(packagePath, [".go"]);
    if (goFiles.length > 0) {
      result.hasGo = true;
      result.goRoot = packagePath;
    }
  }

  const packageJsonPath = join(packagePath, "package.json");
  const hasPackageJson = await fileExists(packageJsonPath);

  if (hasPackageJson) {
    result.hasTypeScript = true;
    result.tsRoot = packagePath;
  } else {
    const tsJsFiles = await findFilesWithExtensions(packagePath, [
      ".ts",
      ".js",
      ".tsx",
      ".jsx",
    ]);
    if (tsJsFiles.length > 0) {
      result.hasTypeScript = true;
      result.tsRoot = packagePath;
    }
  }

  return result;
}
