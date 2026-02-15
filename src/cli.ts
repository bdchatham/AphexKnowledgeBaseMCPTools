#!/usr/bin/env node

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { indexWorkspace } from "./tools/workspace_indexing.js";
import { syncToKnowledgeBase } from "./tools/knowledge_base_sync.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };
  return pkg.version;
}

function splitList(val: string): string[] {
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const version = await loadVersion();

  const program = new Command()
    .name("aphex-kb")
    .description("Aphex Knowledge Base — SCIP indexing and graph sync CLI")
    .version(version);

  program
    .command("index")
    .description("Discover packages and run SCIP indexing across a workspace")
    .requiredOption("-w, --workspace <path>", "Path to the workspace root")
    .option("-p, --packages <list>", "Comma-separated package names to index", splitList)
    .option("-f, --force", "Force re-index regardless of change detection")
    .action(async (opts: { workspace: string; packages?: string[]; force?: boolean }) => {
      const result = await indexWorkspace({
        workspacePath: opts.workspace,
        packages: opts.packages,
        force: opts.force ?? false,
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.success ? 0 : 1;
    });

  program
    .command("sync")
    .description("Sync SCIP indexes and documentation to the Code Graph and Vector Store")
    .requiredOption("-w, --workspace <path>", "Path to the workspace root")
    .option("-p, --packages <list>", "Comma-separated package names to sync", splitList)
    .option("-f, --force", "Force sync regardless of change detection")
    .action(async (opts: { workspace: string; packages?: string[]; force?: boolean }) => {
      const result = await syncToKnowledgeBase({
        workspacePath: opts.workspace,
        packages: opts.packages,
        force: opts.force ?? false,
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.success ? 0 : 1;
    });

  await program.parseAsync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
