/**
 * Knowledge Base Sync Tool
 *
 * MCP tool that syncs SCIP indexes and Archon documentation to the
 * Knowledge Base Code Graph (via GraphQL) and Vector Store (via Qdrant).
 *
 * Service endpoints are read from environment variables:
 *   GRAPH_URL     - Code graph service (e.g., http://kb-name-graph:8081)
 *   QDRANT_URL    - Qdrant vector store (e.g., http://kb-name-qdrant:6334)
 *   EMBEDDING_URL - Embedding service (e.g., http://kb-name-embedding-svc:8000)
 */

import { basename, join, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";

import { parse as parseScipIndex } from "../lib/scip_parser.js";
import { generateForFile } from "../lib/doc_generator.js";
import { GraphClient } from "../lib/graph_client.js";
import { VectorClient } from "../lib/vector_client.js";
import { discoverPackages } from "./workspace_indexing.js";
import type {
  SyncToKnowledgeBaseInput,
  SyncToKnowledgeBaseOutput,
  PackageSyncSummary,
  PackageError,
} from "../types/tools.js";
import type { ScipSymbol, ScipRelationship } from "../types/scip.js";

const DEFAULT_WORKSPACE = "workspace";

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function filterPackagesByName(
  allPackages: string[],
  filterPackages?: string[]
): string[] {
  if (!filterPackages || filterPackages.length === 0) return allPackages;

  const filterSet = new Set(filterPackages.map((p) => p.toLowerCase()));

  return allPackages.filter((packagePath) => {
    const name = basename(packagePath).toLowerCase();
    const normalized = packagePath.toLowerCase();
    return (
      filterSet.has(name) ||
      filterSet.has(normalized) ||
      filterPackages.some(
        (f) => normalized.endsWith(f.toLowerCase()) || packagePath.includes(f)
      )
    );
  });
}

async function findScipIndexes(packagePath: string): Promise<string[]> {
  const scipDir = join(packagePath, ".archon", "scip");
  const indexes: string[] = [];

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(scipDir);
    for (const entry of entries) {
      if (entry.endsWith(".scip")) indexes.push(join(scipDir, entry));
    }
  } catch {
    // no indexes
  }

  return indexes;
}

function groupSymbolsByFile(
  symbols: ScipSymbol[]
): Map<string, ScipSymbol[]> {
  const grouped = new Map<string, ScipSymbol[]>();
  for (const symbol of symbols) {
    const file = symbol.location.file;
    const existing = grouped.get(file) ?? [];
    existing.push(symbol);
    grouped.set(file, existing);
  }
  return grouped;
}

function getServiceUrls(): {
  graphUrl: string | undefined;
  qdrantUrl: string | undefined;
  embeddingUrl: string | undefined;
} {
  return {
    graphUrl: process.env["GRAPH_URL"],
    qdrantUrl: process.env["QDRANT_URL"],
    embeddingUrl: process.env["EMBEDDING_URL"],
  };
}

export async function syncToKnowledgeBase(
  input: SyncToKnowledgeBaseInput
): Promise<SyncToKnowledgeBaseOutput> {
  const { workspacePath, packages: packageFilter, force = false } = input;
  const resolvedWorkspacePath = resolve(workspacePath);

  if (!(await isDirectory(resolvedWorkspacePath))) {
    return {
      success: false,
      workspacePath: resolvedWorkspacePath,
      packagesSynced: [],
      packagesSkipped: [],
      totalNodesCreated: 0,
      totalChunksUpserted: 0,
      errors: [{ package: resolvedWorkspacePath, error: "Workspace path not found" }],
    };
  }

  const { graphUrl, qdrantUrl, embeddingUrl } = getServiceUrls();

  if (!graphUrl || !qdrantUrl || !embeddingUrl) {
    return {
      success: false,
      workspacePath: resolvedWorkspacePath,
      packagesSynced: [],
      packagesSkipped: [],
      totalNodesCreated: 0,
      totalChunksUpserted: 0,
      errors: [{
        package: resolvedWorkspacePath,
        error: "Missing environment variables: GRAPH_URL, QDRANT_URL, EMBEDDING_URL",
      }],
    };
  }

  const graphClient = new GraphClient(graphUrl);
  const vectorClient = new VectorClient(qdrantUrl, embeddingUrl);

  const allPackages = await discoverPackages(resolvedWorkspacePath);
  const filteredPackages = filterPackagesByName(allPackages, packageFilter);

  const packagesSynced: PackageSyncSummary[] = [];
  const packagesSkipped: string[] = [];
  const errors: PackageError[] = [];
  let totalNodesCreated = 0;
  let totalChunksUpserted = 0;

  for (const packagePath of filteredPackages) {
    const packageName = basename(packagePath);

    try {
      const indexPaths = await findScipIndexes(packagePath);

      if (indexPaths.length === 0) {
        packagesSkipped.push(packageName);
        continue;
      }

      let allSymbols: ScipSymbol[] = [];
      let allRelationships: ScipRelationship[] = [];
      let latestHash = "";

      for (const indexPath of indexPaths) {
        const parseResult = await parseScipIndex(
          indexPath,
          DEFAULT_WORKSPACE,
          packageName
        );
        allSymbols.push(...parseResult.symbols);
        allRelationships.push(...parseResult.relationships);
        latestHash = parseResult.hash;
      }

      if (allSymbols.length === 0) {
        packagesSkipped.push(packageName);
        continue;
      }

      // Sync to code graph
      const graphResult = await graphClient.syncFromScip(
        packagePath,
        DEFAULT_WORKSPACE,
        packageName,
        allSymbols,
        allRelationships,
        latestHash
      );

      const keepArns = allSymbols.map((s) => s.arn);
      const nodesPruned = await graphClient.prunePackage(packageName, keepArns);

      // Generate docs and sync to vector store
      const symbolsByFile = groupSymbolsByFile(allSymbols);
      let chunksUpserted = 0;
      let chunksPruned = 0;
      const currentArns: string[] = [];

      for (const [filePath, fileSymbols] of symbolsByFile) {
        const fileRelationships = allRelationships.filter(
          (r) =>
            fileSymbols.some((s) => s.arn === r.from) ||
            fileSymbols.some((s) => s.arn === r.to)
        );

        const doc = generateForFile(filePath, fileSymbols, fileRelationships);
        currentArns.push(doc.arn);

        const chunks = vectorClient.chunkDocument(
          doc.content,
          doc.docPath,
          doc.arn,
          doc.referencedArns,
          packageName
        );

        if (chunks.length > 0) {
          chunksUpserted += await vectorClient.upsertChunks(chunks);
        }
      }

      chunksPruned = await vectorClient.pruneStaleChunks(
        packageName,
        currentArns
      );

      packagesSynced.push({
        package: packageName,
        nodesCreated: graphResult.nodesCreated,
        nodesUpdated: graphResult.nodesUpdated,
        edgesCreated: graphResult.edgesCreated,
        chunksUpserted,
        nodesPruned,
        chunksPruned,
      });

      totalNodesCreated += graphResult.nodesCreated;
      totalChunksUpserted += chunksUpserted;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push({ package: packageName, error: errorMessage });
    }
  }

  return {
    success: packagesSynced.length > 0 || errors.length === 0,
    workspacePath: resolvedWorkspacePath,
    packagesSynced,
    packagesSkipped,
    totalNodesCreated,
    totalChunksUpserted,
    errors,
  };
}
