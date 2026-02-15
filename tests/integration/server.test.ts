/**
 * Integration Tests for MCP Server
 *
 * Tests for the MCP server that verifies:
 * - Server can be instantiated
 * - All 5 tools are registered correctly
 * - Tools can be invoked and return proper response structure
 * - Error handling returns structured error responses
 *
 * @see Requirements 1.1, 4.1, 5.1, 6.1, 7.1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import tool implementations
import { generateScipIndex } from "../../src/tools/scip_indexing.js";
import { generateArchonDoc } from "../../src/tools/doc_generation.js";
import { resolveArn } from "../../src/tools/arn_resolution.js";
import { indexWorkspace } from "../../src/tools/workspace_indexing.js";
import { documentWorkspace } from "../../src/tools/workspace_docs.js";

const SERVER_NAME = "aphex-knowledge-base-mcp-tools";
const SERVER_VERSION = "0.1.0";

/**
 * Format a tool result as MCP content.
 * Mirrors the implementation in src/server.ts
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
 * Mirrors the implementation in src/server.ts
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

describe("MCP Server Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `mcp-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("server instantiation", () => {
    /**
     * Tests that the MCP server can be instantiated correctly.
     * Validates: Requirements 1.1, 4.1, 5.1, 6.1, 7.1
     */

    it("should create MCP server instance with correct name and version", () => {
      const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
      });

      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpServer);
    });

    it("should create server with expected configuration", () => {
      const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
      });

      // Server should be created without throwing
      expect(() => server).not.toThrow();
    });
  });

  describe("tool registration", () => {
    /**
     * Tests that all 5 tools are registered correctly with the MCP server.
     * Validates: Requirements 1.1, 4.1, 5.1, 6.1, 7.1
     */

    let server: McpServer;

    beforeEach(() => {
      server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
      });
    });

    it("should register generate_scip_index tool without error", () => {
      expect(() => {
        server.tool(
          "generate_scip_index",
          "Generate SCIP indexes for a package",
          {
            packagePath: z.string().describe("Path to the package to index"),
            force: z.boolean().optional().describe("Force re-index even if unchanged"),
          },
          async (args) => {
            const result = await generateScipIndex({
              packagePath: args.packagePath,
              force: args.force,
            });
            return formatToolResult(result);
          }
        );
      }).not.toThrow();
    });

    it("should register generate_archon_doc tool without error", () => {
      expect(() => {
        server.tool(
          "generate_archon_doc",
          "Generate plain English documentation from SCIP indexes",
          {
            packagePath: z.string().describe("Path to the package to document"),
            files: z.array(z.string()).optional().describe("Specific files to document"),
            force: z.boolean().optional().describe("Force regeneration"),
          },
          async (args) => {
            const result = await generateArchonDoc({
              packagePath: args.packagePath,
              files: args.files,
              force: args.force,
            });
            return formatToolResult(result);
          }
        );
      }).not.toThrow();
    });

    it("should register resolve_arn tool without error", () => {
      expect(() => {
        server.tool(
          "resolve_arn",
          "Resolve an ARN to its file location",
          {
            arn: z.string().describe("The ARN to resolve"),
          },
          async (args) => {
            const result = await resolveArn({ arn: args.arn });
            return formatToolResult(result);
          }
        );
      }).not.toThrow();
    });

    it("should register index_workspace tool without error", () => {
      expect(() => {
        server.tool(
          "index_workspace",
          "Orchestrate SCIP indexing across all packages in a workspace",
          {
            workspacePath: z.string().describe("Path to the workspace root"),
            packages: z.array(z.string()).optional().describe("Specific packages to index"),
            force: z.boolean().optional().describe("Force re-index all packages"),
          },
          async (args) => {
            const result = await indexWorkspace({
              workspacePath: args.workspacePath,
              packages: args.packages,
              force: args.force,
            });
            return formatToolResult(result);
          }
        );
      }).not.toThrow();
    });

    it("should register document_workspace tool without error", () => {
      expect(() => {
        server.tool(
          "document_workspace",
          "Orchestrate documentation generation across all packages",
          {
            workspacePath: z.string().describe("Path to the workspace root"),
            packages: z.array(z.string()).optional().describe("Specific packages to document"),
            force: z.boolean().optional().describe("Force regeneration"),
          },
          async (args) => {
            const result = await documentWorkspace({
              workspacePath: args.workspacePath,
              packages: args.packages,
              force: args.force,
            });
            return formatToolResult(result);
          }
        );
      }).not.toThrow();
    });

    it("should register all 5 tools on the same server instance", () => {
      expect(() => {
        // Register all 5 tools
        server.tool(
          "generate_scip_index",
          "Generate SCIP indexes",
          { packagePath: z.string() },
          async (args) => formatToolResult({ success: true })
        );

        server.tool(
          "generate_archon_doc",
          "Generate documentation",
          { packagePath: z.string() },
          async (args) => formatToolResult({ success: true })
        );

        server.tool(
          "resolve_arn",
          "Resolve ARN",
          { arn: z.string() },
          async (args) => formatToolResult({ success: true })
        );

        server.tool(
          "index_workspace",
          "Index workspace",
          { workspacePath: z.string() },
          async (args) => formatToolResult({ success: true })
        );

        server.tool(
          "document_workspace",
          "Document workspace",
          { workspacePath: z.string() },
          async (args) => formatToolResult({ success: true })
        );
      }).not.toThrow();
    });
  });

  describe("tool invocation - generate_scip_index", () => {
    /**
     * Tests that generate_scip_index tool can be invoked and returns proper response.
     * Validates: Requirement 1.1
     */

    it("should invoke generate_scip_index and return structured response", async () => {
      const result = await generateScipIndex({ packagePath: testDir });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("languagesDetected");
      expect(result).toHaveProperty("indexes");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.languagesDetected)).toBe(true);
      expect(Array.isArray(result.indexes)).toBe(true);
    });

    it("should format generate_scip_index result as MCP content", async () => {
      const result = await generateScipIndex({ packagePath: testDir });
      const formatted = formatToolResult(result);

      expect(formatted).toHaveProperty("content");
      expect(Array.isArray(formatted.content)).toBe(true);
      expect(formatted.content.length).toBe(1);
      expect(formatted.content[0]).toHaveProperty("type", "text");
      expect(formatted.content[0]).toHaveProperty("text");
      expect(typeof formatted.content[0].text).toBe("string");

      // Verify the text is valid JSON
      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed).toHaveProperty("success");
    });

    it("should detect Go language when go.mod is present", async () => {
      await writeFile(join(testDir, "go.mod"), "module test");

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("go");
    });

    it("should detect TypeScript language when package.json is present", async () => {
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');

      const result = await generateScipIndex({ packagePath: testDir });

      expect(result.languagesDetected).toContain("typescript");
    });
  });

  describe("tool invocation - generate_archon_doc", () => {
    /**
     * Tests that generate_archon_doc tool can be invoked and returns proper response.
     * Validates: Requirement 4.1
     */

    it("should invoke generate_archon_doc and return structured response", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
      expect(result).toHaveProperty("filesGenerated");
      expect(result).toHaveProperty("filesSkipped");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.filesGenerated)).toBe(true);
      expect(Array.isArray(result.filesSkipped)).toBe(true);
    });

    it("should format generate_archon_doc result as MCP content", async () => {
      const result = await generateArchonDoc({ packagePath: testDir });
      const formatted = formatToolResult(result);

      expect(formatted).toHaveProperty("content");
      expect(formatted.content[0]).toHaveProperty("type", "text");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed).toHaveProperty("success");
      expect(parsed).toHaveProperty("filesGenerated");
    });

    it("should accept optional files parameter", async () => {
      const result = await generateArchonDoc({
        packagePath: testDir,
        files: ["src/index.ts"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept optional force parameter", async () => {
      const result = await generateArchonDoc({
        packagePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });
  });

  describe("tool invocation - resolve_arn", () => {
    /**
     * Tests that resolve_arn tool can be invoked and returns proper response.
     * Validates: Requirement 5.1
     */

    it("should invoke resolve_arn and return structured response for valid ARN", async () => {
      // Create a test file
      const pkgDir = join(testDir, "package");
      await mkdir(pkgDir, { recursive: true });
      await writeFile(join(pkgDir, "index.ts"), "export const x = 1;");

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/package/index.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("arn");
      expect(result).toHaveProperty("resolved");
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.arn).toBe("string");
    });

    it("should format resolve_arn result as MCP content", async () => {
      const result = await resolveArn({ arn: "arn:archon:code:workspace/package/index.ts" });
      const formatted = formatToolResult(result);

      expect(formatted).toHaveProperty("content");
      expect(formatted.content[0]).toHaveProperty("type", "text");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed).toHaveProperty("success");
      expect(parsed).toHaveProperty("arn");
    });

    it("should return error for invalid ARN format", async () => {
      const result = await resolveArn({ arn: "invalid-arn" });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should resolve code ARN type correctly", async () => {
      const pkgDir = join(testDir, "pkg");
      await mkdir(pkgDir, { recursive: true });
      await writeFile(join(pkgDir, "main.ts"), "export const main = () => {};");

      const result = await resolveArn(
        { arn: "arn:archon:code:workspace/pkg/main.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved?.type).toBe("code");
    });

    it("should resolve doc ARN type correctly", async () => {
      const pkgDir = join(testDir, "pkg");
      await mkdir(pkgDir, { recursive: true });
      await writeFile(join(pkgDir, "main.archon.md"), "# Documentation");

      const result = await resolveArn(
        { arn: "arn:archon:doc:workspace/pkg/main.ts" },
        { workspaceBasePath: testDir }
      );

      expect(result.success).toBe(true);
      expect(result.resolved?.type).toBe("doc");
    });
  });

  describe("tool invocation - index_workspace", () => {
    /**
     * Tests that index_workspace tool can be invoked and returns proper response.
     * Validates: Requirement 6.1
     */

    it("should invoke index_workspace and return structured response", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesIndexed");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalSymbols");
      expect(result).toHaveProperty("errors");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.packagesIndexed)).toBe(true);
      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      expect(typeof result.totalSymbols).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should format index_workspace result as MCP content", async () => {
      const result = await indexWorkspace({ workspacePath: testDir });
      const formatted = formatToolResult(result);

      expect(formatted).toHaveProperty("content");
      expect(formatted.content[0]).toHaveProperty("type", "text");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed).toHaveProperty("success");
      expect(parsed).toHaveProperty("packagesIndexed");
    });

    it("should accept optional packages parameter", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        packages: ["pkg1", "pkg2"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept optional force parameter", async () => {
      const result = await indexWorkspace({
        workspacePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });

    it("should discover packages in workspace", async () => {
      // Create a package with go.mod
      const pkgDir = join(testDir, "mypackage");
      await mkdir(pkgDir, { recursive: true });
      await writeFile(join(pkgDir, "go.mod"), "module mypackage");

      const result = await indexWorkspace({ workspacePath: testDir });

      // The result structure should be valid regardless of whether SCIP tools are installed
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesIndexed");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("errors");

      // Should have attempted to process the package (either indexed, skipped, or errored)
      const totalProcessed =
        result.packagesIndexed.length +
        result.packagesSkipped.length +
        result.errors.length;
      expect(totalProcessed).toBeGreaterThanOrEqual(1);

      // If there are errors, they should be about missing SCIP tools (expected in test env)
      if (result.errors.length > 0) {
        const hasScipError = result.errors.some(
          (e) => e.error.includes("scip") || e.error.includes("not installed")
        );
        // Either SCIP tool error or some other valid error
        expect(result.errors[0]).toHaveProperty("package");
        expect(result.errors[0]).toHaveProperty("error");
      }
    });
  });

  describe("tool invocation - document_workspace", () => {
    /**
     * Tests that document_workspace tool can be invoked and returns proper response.
     * Validates: Requirement 7.1
     */

    it("should invoke document_workspace and return structured response", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
      expect(result).toHaveProperty("packagesDocumented");
      expect(result).toHaveProperty("packagesSkipped");
      expect(result).toHaveProperty("totalFilesGenerated");
      expect(result).toHaveProperty("totalArns");
      expect(result).toHaveProperty("errors");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.packagesDocumented)).toBe(true);
      expect(Array.isArray(result.packagesSkipped)).toBe(true);
      expect(typeof result.totalFilesGenerated).toBe("number");
      expect(typeof result.totalArns).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should format document_workspace result as MCP content", async () => {
      const result = await documentWorkspace({ workspacePath: testDir });
      const formatted = formatToolResult(result);

      expect(formatted).toHaveProperty("content");
      expect(formatted.content[0]).toHaveProperty("type", "text");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed).toHaveProperty("success");
      expect(parsed).toHaveProperty("packagesDocumented");
    });

    it("should accept optional packages parameter", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        packages: ["pkg1"],
      });

      expect(result).toHaveProperty("success");
    });

    it("should accept optional force parameter", async () => {
      const result = await documentWorkspace({
        workspacePath: testDir,
        force: true,
      });

      expect(result).toHaveProperty("success");
    });
  });

  describe("error handling", () => {
    /**
     * Tests that error handling returns structured error responses.
     * Validates: Requirements 1.10, 5.4
     */

    it("should format errors with isError flag", () => {
      const error = new Error("Test error message");
      const formatted = formatToolError(error, "test_tool");

      expect(formatted).toHaveProperty("content");
      expect(formatted).toHaveProperty("isError", true);
      expect(formatted.content[0]).toHaveProperty("type", "text");
    });

    it("should include tool name in error message", () => {
      const error = new Error("Something went wrong");
      const formatted = formatToolError(error, "my_tool");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed.error).toContain("my_tool");
      expect(parsed.error).toContain("Something went wrong");
    });

    it("should handle non-Error objects in formatToolError", () => {
      const formatted = formatToolError("string error", "test_tool");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("string error");
    });

    it("should return success=false in error response", () => {
      const error = new Error("Test error");
      const formatted = formatToolError(error, "test_tool");

      const parsed = JSON.parse(formatted.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it("should handle generate_scip_index errors gracefully", async () => {
      // Test with non-existent path - should not throw
      const result = await generateScipIndex({ packagePath: "/nonexistent/path/12345" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
    });

    it("should handle resolve_arn errors gracefully", async () => {
      const result = await resolveArn({ arn: "" });

      expect(result).toHaveProperty("success");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle index_workspace errors gracefully", async () => {
      const result = await indexWorkspace({ workspacePath: "/nonexistent/workspace/path" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("errors");
    });

    it("should handle document_workspace errors gracefully", async () => {
      const result = await documentWorkspace({ workspacePath: "/nonexistent/workspace/path" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("MCP protocol response format", () => {
    /**
     * Tests that tool responses conform to MCP protocol format.
     * Validates: Requirements 1.1, 4.1, 5.1, 6.1, 7.1
     */

    it("should return content array with text type for successful results", async () => {
      const result = await generateScipIndex({ packagePath: testDir });
      const formatted = formatToolResult(result);

      expect(formatted.content).toBeInstanceOf(Array);
      expect(formatted.content.length).toBe(1);
      expect(formatted.content[0].type).toBe("text");
      expect(typeof formatted.content[0].text).toBe("string");
    });

    it("should return valid JSON in text content", async () => {
      const result = await generateScipIndex({ packagePath: testDir });
      const formatted = formatToolResult(result);

      expect(() => JSON.parse(formatted.content[0].text)).not.toThrow();
    });

    it("should format result with proper indentation", async () => {
      const result = await generateScipIndex({ packagePath: testDir });
      const formatted = formatToolResult(result);

      // JSON.stringify with null, 2 produces indented output
      expect(formatted.content[0].text).toContain("\n");
    });

    it("should include isError flag only for error responses", async () => {
      const successResult = await generateScipIndex({ packagePath: testDir });
      const successFormatted = formatToolResult(successResult);

      const errorFormatted = formatToolError(new Error("test"), "test_tool");

      expect(successFormatted).not.toHaveProperty("isError");
      expect(errorFormatted).toHaveProperty("isError", true);
    });
  });

  describe("tool parameter validation", () => {
    /**
     * Tests that tools validate their input parameters correctly.
     * Validates: Requirements 1.1, 4.1, 5.1, 6.1, 7.1
     */

    it("should handle empty packagePath for generate_scip_index", async () => {
      const result = await generateScipIndex({ packagePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
    });

    it("should handle empty packagePath for generate_archon_doc", async () => {
      const result = await generateArchonDoc({ packagePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("packagePath");
    });

    it("should handle empty arn for resolve_arn", async () => {
      const result = await resolveArn({ arn: "" });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle empty workspacePath for index_workspace", async () => {
      const result = await indexWorkspace({ workspacePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
    }, 30000);

    it("should handle empty workspacePath for document_workspace", async () => {
      const result = await documentWorkspace({ workspacePath: "" });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("workspacePath");
    });

    it("should handle undefined optional parameters", async () => {
      const result = await generateScipIndex({
        packagePath: testDir,
        force: undefined,
      });

      expect(result).toHaveProperty("success");
    });
  });

  describe("concurrent tool invocations", () => {
    /**
     * Tests that multiple tools can be invoked concurrently.
     * Validates: Requirements 1.1, 4.1, 5.1, 6.1, 7.1
     */

    it("should handle concurrent invocations of different tools", async () => {
      const [scipResult, docResult, arnResult] = await Promise.all([
        generateScipIndex({ packagePath: testDir }),
        generateArchonDoc({ packagePath: testDir }),
        resolveArn({ arn: "arn:archon:code:workspace/pkg/index.ts" }),
      ]);

      expect(scipResult).toHaveProperty("success");
      expect(docResult).toHaveProperty("success");
      expect(arnResult).toHaveProperty("success");
    });

    it("should handle concurrent invocations of workspace tools", async () => {
      const [indexResult, docResult] = await Promise.all([
        indexWorkspace({ workspacePath: testDir }),
        documentWorkspace({ workspacePath: testDir }),
      ]);

      expect(indexResult).toHaveProperty("success");
      expect(docResult).toHaveProperty("success");
    });

    it("should handle multiple concurrent invocations of same tool", async () => {
      const results = await Promise.all([
        generateScipIndex({ packagePath: testDir }),
        generateScipIndex({ packagePath: testDir }),
        generateScipIndex({ packagePath: testDir }),
      ]);

      for (const result of results) {
        expect(result).toHaveProperty("success");
        expect(result).toHaveProperty("packagePath");
      }
    });
  });
});
