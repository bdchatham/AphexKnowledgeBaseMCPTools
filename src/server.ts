#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * This is the main entry point for the Archon Documentation MCP Tools server.
 * It exposes tools for SCIP indexing and documentation generation to Kiro agents.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Import tool implementations
import { generateScipIndex } from "./tools/scip_indexing.js";
import { generateArchonDoc } from "./tools/doc_generation.js";
import { resolveArn } from "./tools/arn_resolution.js";
import { indexWorkspace } from "./tools/workspace_indexing.js";
import { documentWorkspace } from "./tools/workspace_docs.js";
import { syncToKnowledgeBase } from "./tools/knowledge_base_sync.js";

const SERVER_NAME = "aphex-knowledge-base-mcp-tools";
const SERVER_VERSION = "0.1.0";

/**
 * Format a tool result as MCP content.
 * Converts the tool output to a JSON string wrapped in a text content block.
 *
 * @param result - The tool result object
 * @returns MCP-compatible content array
 */
function formatToolResult(result: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Format an error as MCP content.
 * Wraps the error message in a structured error response.
 *
 * @param error - The error that occurred
 * @param toolName - The name of the tool that failed
 * @returns MCP-compatible content array with error information
 */
function formatToolError(
  error: unknown,
  toolName: string
): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: false,
            error: `${toolName} failed: ${errorMessage}`,
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

/**
 * Register all MCP tools with the server.
 *
 * @param server - The MCP server instance
 */
function registerTools(server: McpServer): void {
  // Tool 1: generate_scip_index
  server.tool(
    "generate_scip_index",
    "Generate SCIP indexes for a package by detecting languages and invoking appropriate SCIP tools (scip-go, scip-typescript).",
    {
      packagePath: z.string().describe("Path to the package to index"),
      force: z
        .boolean()
        .optional()
        .describe("Force re-index even if unchanged"),
    },
    async (args) => {
      try {
        const result = await generateScipIndex({
          packagePath: args.packagePath,
          force: args.force,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "generate_scip_index");
      }
    }
  );

  // Tool 2: generate_archon_doc
  server.tool(
    "generate_archon_doc",
    "Generate plain English documentation from SCIP indexes with ARN references. Creates .archon.md files co-located with source files.",
    {
      packagePath: z.string().describe("Path to the package to document"),
      files: z
        .array(z.string())
        .optional()
        .describe("Optional: specific files to document"),
      force: z
        .boolean()
        .optional()
        .describe("Force regeneration even if unchanged"),
    },
    async (args) => {
      try {
        const result = await generateArchonDoc({
          packagePath: args.packagePath,
          files: args.files,
          force: args.force,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "generate_archon_doc");
      }
    }
  );

  // Tool 3: resolve_arn
  server.tool(
    "resolve_arn",
    "Resolve an ARN to its file location and symbol information. Supports both code and doc ARN types.",
    {
      arn: z.string().describe("The ARN to resolve"),
    },
    async (args) => {
      try {
        const result = await resolveArn({
          arn: args.arn,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "resolve_arn");
      }
    }
  );

  // Tool 4: index_workspace
  server.tool(
    "index_workspace",
    "Orchestrate SCIP indexing across all packages in a workspace. Discovers packages, analyzes dependencies, and indexes in dependency order.",
    {
      workspacePath: z.string().describe("Path to the workspace root"),
      packages: z
        .array(z.string())
        .optional()
        .describe("Optional: specific packages to index"),
      force: z
        .boolean()
        .optional()
        .describe("Force re-index all packages regardless of change status"),
    },
    async (args) => {
      try {
        const result = await indexWorkspace({
          workspacePath: args.workspacePath,
          packages: args.packages,
          force: args.force,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "index_workspace");
      }
    }
  );

  // Tool 5: document_workspace
  server.tool(
    "document_workspace",
    "Orchestrate documentation generation across all packages in a workspace. Only generates documentation for packages with changed SCIP indexes.",
    {
      workspacePath: z.string().describe("Path to the workspace root"),
      packages: z
        .array(z.string())
        .optional()
        .describe("Optional: specific packages to document"),
      force: z
        .boolean()
        .optional()
        .describe("Force regeneration for all packages regardless of change status"),
    },
    async (args) => {
      try {
        const result = await documentWorkspace({
          workspacePath: args.workspacePath,
          packages: args.packages,
          force: args.force,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "document_workspace");
      }
    }
  );

  // Tool 6: sync_to_knowledge_base
  server.tool(
    "sync_to_knowledge_base",
    "Sync SCIP indexes and Archon documentation to the Knowledge Base. Orchestrates synchronization of code intelligence data to the Code Graph and Vector Store.",
    {
      workspacePath: z.string().describe("Path to the workspace root"),
      packages: z
        .array(z.string())
        .optional()
        .describe("Optional: specific packages to sync"),
      force: z
        .boolean()
        .optional()
        .describe("Force sync regardless of change status"),
    },
    async (args) => {
      try {
        const result = await syncToKnowledgeBase({
          workspacePath: args.workspacePath,
          packages: args.packages,
          force: args.force,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error, "sync_to_knowledge_base");
      }
    }
  );
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all 6 tools with the server
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
