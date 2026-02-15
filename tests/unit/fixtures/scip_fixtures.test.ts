/**
 * Unit Tests for SCIP Test Fixtures
 *
 * Verifies that the SCIP test fixtures in tests/fixtures/scip/ are valid
 * and can be parsed correctly by the SCIP parser.
 *
 * @see Requirements 3.1-3.7
 */

import { parse } from "../../../src/lib/scip_parser.js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "..", "..", "fixtures", "scip");

describe("SCIP Test Fixtures", () => {
  describe("valid fixtures", () => {
    describe("empty.scip", () => {
      it("should parse as a valid empty index", async () => {
        const indexPath = join(fixturesDir, "empty.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        expect(result.symbols).toEqual([]);
        expect(result.relationships).toEqual([]);
        expect(result.hash).toBeTruthy();
        expect(result.hash.length).toBe(64); // SHA-256 hex length
        expect(result.errors).toBeUndefined();
      });
    });

    describe("valid-simple.scip", () => {
      it("should parse as a valid index with a single function", async () => {
        const indexPath = join(fixturesDir, "valid-simple.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        expect(result.symbols).toHaveLength(1);
        expect(result.symbols[0].name).toBe("greet");
        expect(result.symbols[0].kind).toBe("function");
        expect(result.symbols[0].location.file).toBe("src/index.ts");
        expect(result.symbols[0].documentation).toContain("Greets a user by name");
        expect(result.symbols[0].arn).toContain("arn:archon:code:");
        expect(result.errors).toBeUndefined();
      });
    });

    describe("valid-multi-symbol.scip", () => {
      it("should parse as a valid index with multiple symbol kinds", async () => {
        const indexPath = join(fixturesDir, "valid-multi-symbol.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        // Should have symbols from multiple files
        expect(result.symbols.length).toBeGreaterThan(5);

        // Check for different symbol kinds
        const kinds = new Set(result.symbols.map((s) => s.kind));
        expect(kinds.has("function")).toBe(true);
        expect(kinds.has("class")).toBe(true);
        expect(kinds.has("method")).toBe(true);
        expect(kinds.has("module")).toBe(true);
        expect(kinds.has("variable")).toBe(true);
        expect(kinds.has("type")).toBe(true);

        // Check for specific symbols
        const symbolNames = result.symbols.map((s) => s.name);
        expect(symbolNames).toContain("User");
        expect(symbolNames).toContain("getName");
        expect(symbolNames).toContain("formatDate");
        expect(symbolNames).toContain("UserId");
        expect(symbolNames).toContain("IUserService");

        expect(result.errors).toBeUndefined();
      });

      it("should have symbols from multiple files", async () => {
        const indexPath = join(fixturesDir, "valid-multi-symbol.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const files = new Set(result.symbols.map((s) => s.location.file));
        expect(files.size).toBeGreaterThan(1);
        expect(files.has("src/models/User.ts")).toBe(true);
        expect(files.has("src/types/index.ts")).toBe(true);
        expect(files.has("src/utils/helpers.ts")).toBe(true);
      });
    });

    describe("valid-with-relationships.scip", () => {
      it("should parse as a valid index with relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        expect(result.symbols.length).toBeGreaterThan(0);
        expect(result.relationships.length).toBeGreaterThan(0);
        expect(result.errors).toBeUndefined();
      });

      it("should extract contains relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const containsRels = result.relationships.filter((r) => r.type === "contains");
        expect(containsRels.length).toBeGreaterThan(0);
      });

      it("should extract implements relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const implementsRels = result.relationships.filter((r) => r.type === "implements");
        expect(implementsRels.length).toBeGreaterThan(0);

        // UserRepository should implement IRepository
        const userRepoSymbol = result.symbols.find((s) => s.name === "UserRepository");
        const iRepoSymbol = result.symbols.find((s) => s.name === "IRepository");
        expect(userRepoSymbol).toBeDefined();
        expect(iRepoSymbol).toBeDefined();

        const hasImplementsRel = implementsRels.some(
          (r) => r.from === userRepoSymbol?.arn && r.to === iRepoSymbol?.arn
        );
        expect(hasImplementsRel).toBe(true);
      });

      it("should extract extends relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const extendsRels = result.relationships.filter((r) => r.type === "extends");
        expect(extendsRels.length).toBeGreaterThan(0);

        // User should extend BaseEntity
        const userSymbol = result.symbols.find((s) => s.name === "User");
        const baseEntitySymbol = result.symbols.find((s) => s.name === "BaseEntity");
        expect(userSymbol).toBeDefined();
        expect(baseEntitySymbol).toBeDefined();

        const hasExtendsRel = extendsRels.some(
          (r) => r.from === userSymbol?.arn && r.to === baseEntitySymbol?.arn
        );
        expect(hasExtendsRel).toBe(true);
      });

      it("should extract imports relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const importsRels = result.relationships.filter((r) => r.type === "imports");
        expect(importsRels.length).toBeGreaterThan(0);
      });

      it("should extract references relationships", async () => {
        const indexPath = join(fixturesDir, "valid-with-relationships.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        const referencesRels = result.relationships.filter((r) => r.type === "references");
        expect(referencesRels.length).toBeGreaterThan(0);
      });
    });
  });

  describe("malformed fixtures", () => {
    describe("malformed-truncated.scip", () => {
      it("should return an error for truncated file", async () => {
        const indexPath = join(fixturesDir, "malformed-truncated.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        // Should have errors
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);

        // Should not crash - symbols array should exist (possibly empty)
        expect(Array.isArray(result.symbols)).toBe(true);
      });
    });

    describe("malformed-invalid-protobuf.scip", () => {
      it("should return an error for invalid protobuf data", async () => {
        const indexPath = join(fixturesDir, "malformed-invalid-protobuf.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        // Should have errors
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);

        // Should not crash - symbols array should exist (possibly empty)
        expect(Array.isArray(result.symbols)).toBe(true);
      });
    });

    describe("malformed-wrong-schema.scip", () => {
      it("should handle wrong schema gracefully", async () => {
        const indexPath = join(fixturesDir, "malformed-wrong-schema.scip");
        const result = await parse(indexPath, "test-workspace", "test-package");

        // Should not crash - may or may not have errors depending on how protobuf handles it
        expect(Array.isArray(result.symbols)).toBe(true);
        expect(Array.isArray(result.relationships)).toBe(true);
      });
    });
  });

  describe("fixture file integrity", () => {
    it("should have all expected fixture files", async () => {
      const expectedFiles = [
        "empty.scip",
        "valid-simple.scip",
        "valid-multi-symbol.scip",
        "valid-with-relationships.scip",
        "malformed-truncated.scip",
        "malformed-invalid-protobuf.scip",
        "malformed-wrong-schema.scip",
      ];

      for (const file of expectedFiles) {
        const filePath = join(fixturesDir, file);
        const buffer = await readFile(filePath);
        expect(buffer.length).toBeGreaterThan(0);
      }
    });

    it("should have JSON documentation for valid fixtures", async () => {
      const validFixtures = ["empty", "valid-simple", "valid-multi-symbol", "valid-with-relationships"];

      for (const fixture of validFixtures) {
        const jsonPath = join(fixturesDir, `${fixture}.json`);
        const jsonContent = await readFile(jsonPath, "utf-8");
        const parsed = JSON.parse(jsonContent);
        expect(parsed).toBeDefined();
      }
    });
  });
});
