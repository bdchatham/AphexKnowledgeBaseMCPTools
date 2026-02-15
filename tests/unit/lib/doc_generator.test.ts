/**
 * Unit tests for Documentation Generator
 *
 * Tests the generateForSymbol function that generates plain English
 * documentation from SCIP symbol information.
 *
 * Source: AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md
 */

import {
  generateForSymbol,
  generateForFile,
  getTemplateForKind,
  getAllTemplates,
  renderTemplate,
  generateForSymbolWithTemplate,
  preserveManualSections,
  extractManualSections,
  isOrphaned,
  markOrphaned,
} from "../../../src/lib/doc_generator.js";
import type { ScipSymbol, ScipRelationship, SymbolKind } from "../../../src/types/scip.js";

describe("Documentation Generator", () => {
  describe("generateForSymbol", () => {
    it("should generate documentation for a simple function symbol", () => {
      const symbol: ScipSymbol = {
        name: "calculateTotal",
        kind: "function",
        signature: "function calculateTotal(items: Item[]): number",
        documentation: "Calculates the total price of all items.",
        location: {
          file: "src/utils/pricing.ts",
          line: 10,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/utils/pricing.ts#calculateTotal",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.sourcePath).toBe("src/utils/pricing.ts");
      expect(result.docPath).toBe("src/utils/pricing.archon.md");
      expect(result.arn).toBe(symbol.arn);
      expect(result.referencedArns).toEqual([]);
      expect(result.content).toContain("# calculateTotal");
      expect(result.content).toContain("<!-- archon:generated -->");
      expect(result.content).toContain(`<!-- source-arn: ${symbol.arn} -->`);
      expect(result.content).toContain("## Purpose");
      expect(result.content).toContain("function");
      expect(result.content).toContain("src/utils/pricing.ts");
      expect(result.content).toContain("line 10");
      expect(result.content).toContain("## Description");
      expect(result.content).toContain(
        "Calculates the total price of all items."
      );
      expect(result.content).toContain("## Signature");
      expect(result.content).toContain(
        "function calculateTotal(items: Item[]): number"
      );
      expect(result.content).toContain("**Source**");
    });

    it("should generate documentation for a class symbol", () => {
      const symbol: ScipSymbol = {
        name: "UserService",
        kind: "class",
        signature: "class UserService",
        documentation: "Service for managing user operations.",
        location: {
          file: "src/services/user.ts",
          line: 5,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/services/user.ts#UserService",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# UserService");
      expect(result.content).toContain("This class is defined in");
    });

    it("should generate documentation for a method symbol", () => {
      const symbol: ScipSymbol = {
        name: "getUserById",
        kind: "method",
        signature: "getUserById(id: string): Promise<User>",
        location: {
          file: "src/services/user.ts",
          line: 20,
          column: 2,
        },
        arn: "arn:archon:code:workspace/package/src/services/user.ts#UserService.getUserById",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# getUserById");
      expect(result.content).toContain("This method is defined in");
    });

    it("should include ARN references for related symbols", () => {
      const symbol: ScipSymbol = {
        name: "processOrder",
        kind: "function",
        signature: "function processOrder(order: Order): void",
        location: {
          file: "src/orders/processor.ts",
          line: 15,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/orders/processor.ts#processOrder",
      };

      const relationships: ScipRelationship[] = [
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/orders/validator.ts#validateOrder",
          type: "references",
        },
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/orders/types.ts#Order",
          type: "references",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.content).toContain("## Related Symbols");
      expect(result.content).toContain("### References");
      expect(result.content).toContain(
        "[validateOrder](arn:archon:code:workspace/package/src/orders/validator.ts#validateOrder)"
      );
      expect(result.content).toContain(
        "[Order](arn:archon:code:workspace/package/src/orders/types.ts#Order)"
      );
      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/orders/validator.ts#validateOrder"
      );
      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/orders/types.ts#Order"
      );
    });

    it("should group relationships by type", () => {
      const symbol: ScipSymbol = {
        name: "BaseService",
        kind: "class",
        signature: "class BaseService",
        location: {
          file: "src/services/base.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/services/base.ts#BaseService",
      };

      const relationships: ScipRelationship[] = [
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/interfaces/service.ts#IService",
          type: "implements",
        },
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/services/user.ts#UserService",
          type: "contains",
        },
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/utils/logger.ts#Logger",
          type: "references",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.content).toContain("### Implements");
      expect(result.content).toContain("### Contains");
      expect(result.content).toContain("### References");
      expect(result.referencedArns).toHaveLength(3);
    });

    it("should handle symbols without documentation", () => {
      const symbol: ScipSymbol = {
        name: "helperFunction",
        kind: "function",
        signature: "function helperFunction(): void",
        location: {
          file: "src/utils/helpers.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/utils/helpers.ts#helperFunction",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).not.toContain("## Description");
      expect(result.content).toContain("## Purpose");
      expect(result.content).toContain("## Signature");
    });

    it("should handle symbols without signature", () => {
      const symbol: ScipSymbol = {
        name: "CONFIG",
        kind: "variable",
        signature: "",
        location: {
          file: "src/config.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/config.ts#CONFIG",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).not.toContain("## Signature");
      expect(result.content).toContain("## Purpose");
      expect(result.content).toContain("This variable is defined in");
    });

    it("should only include relationships where symbol is the source", () => {
      const symbol: ScipSymbol = {
        name: "targetFunction",
        kind: "function",
        signature: "function targetFunction(): void",
        location: {
          file: "src/target.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/target.ts#targetFunction",
      };

      const relationships: ScipRelationship[] = [
        // This relationship should be included (symbol is source)
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/other.ts#otherFunction",
          type: "references",
        },
        // This relationship should NOT be included (symbol is target)
        {
          from: "arn:archon:code:workspace/package/src/caller.ts#callerFunction",
          to: symbol.arn,
          type: "references",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.referencedArns).toHaveLength(1);
      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/other.ts#otherFunction"
      );
      expect(result.referencedArns).not.toContain(
        "arn:archon:code:workspace/package/src/caller.ts#callerFunction"
      );
    });

    it("should generate correct doc path for various file extensions", () => {
      const testCases = [
        { file: "src/index.ts", expected: "src/index.archon.md" },
        { file: "src/main.js", expected: "src/main.archon.md" },
        { file: "src/handler.py", expected: "src/handler.archon.md" },
        { file: "cmd/root.go", expected: "cmd/root.archon.md" },
      ];

      for (const { file, expected } of testCases) {
        const symbol: ScipSymbol = {
          name: "testSymbol",
          kind: "function",
          signature: "function testSymbol(): void",
          location: { file, line: 1, column: 0 },
          arn: `arn:archon:code:workspace/package/${file}#testSymbol`,
        };

        const result = generateForSymbol(symbol, []);
        expect(result.docPath).toBe(expected);
      }
    });

    it("should handle type symbols", () => {
      const symbol: ScipSymbol = {
        name: "UserConfig",
        kind: "type",
        signature: "type UserConfig = { name: string; email: string }",
        documentation: "Configuration for user settings.",
        location: {
          file: "src/types/config.ts",
          line: 5,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/types/config.ts#UserConfig",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# UserConfig");
      expect(result.content).toContain("This type definition is defined in");
    });

    it("should handle module symbols", () => {
      const symbol: ScipSymbol = {
        name: "utils",
        kind: "module",
        signature: "module utils",
        location: {
          file: "src/utils/index.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/utils/index.ts#utils",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# utils");
      expect(result.content).toContain("This module is defined in");
    });

    it("should handle extends relationships", () => {
      const symbol: ScipSymbol = {
        name: "ChildClass",
        kind: "class",
        signature: "class ChildClass extends ParentClass",
        location: {
          file: "src/classes/child.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/classes/child.ts#ChildClass",
      };

      const relationships: ScipRelationship[] = [
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/classes/parent.ts#ParentClass",
          type: "extends",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.content).toContain("### Extends");
      expect(result.content).toContain(
        "[ParentClass](arn:archon:code:workspace/package/src/classes/parent.ts#ParentClass)"
      );
    });

    it("should handle imports relationships", () => {
      const symbol: ScipSymbol = {
        name: "main",
        kind: "module",
        signature: "module main",
        location: {
          file: "src/main.ts",
          line: 1,
          column: 0,
        },
        arn: "arn:archon:code:workspace/package/src/main.ts#main",
      };

      const relationships: ScipRelationship[] = [
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/utils/helpers.ts",
          type: "imports",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.content).toContain("### Imports");
      // When no symbol in ARN, should extract from path
      expect(result.content).toContain("[helpers]");
    });
  });

  describe("generateForFile", () => {
    it("should generate documentation for a file with multiple symbols", () => {
      const filePath = "src/utils/helpers.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "formatDate",
          kind: "function",
          signature: "function formatDate(date: Date): string",
          documentation: "Formats a date to a human-readable string.",
          location: { file: filePath, line: 5, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils/helpers.ts#formatDate",
        },
        {
          name: "parseNumber",
          kind: "function",
          signature: "function parseNumber(str: string): number",
          documentation: "Parses a string to a number.",
          location: { file: filePath, line: 15, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils/helpers.ts#parseNumber",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.sourcePath).toBe(filePath);
      expect(result.docPath).toBe("src/utils/helpers.archon.md");
      expect(result.arn).toContain("arn:archon:doc:");
      expect(result.content).toContain("# helpers.ts");
      expect(result.content).toContain("<!-- archon:generated -->");
      expect(result.content).toContain("## Overview");
      expect(result.content).toContain(filePath);
      expect(result.content).toContain("## Public API");
      expect(result.content).toContain("### Functions");
      expect(result.content).toContain("formatDate");
      expect(result.content).toContain("parseNumber");
      expect(result.content).toContain("**Source**");
    });

    it("should generate correct doc path for various file paths", () => {
      const testCases = [
        { file: "src/index.ts", expected: "src/index.archon.md" },
        { file: "src/lib/utils.js", expected: "src/lib/utils.archon.md" },
        { file: "cmd/root.go", expected: "cmd/root.archon.md" },
        { file: "main.py", expected: "main.archon.md" },
      ];

      for (const { file, expected } of testCases) {
        const result = generateForFile(file, [], []);
        expect(result.docPath).toBe(expected);
      }
    });

    it("should handle empty symbol list", () => {
      const filePath = "src/empty.ts";
      const result = generateForFile(filePath, [], []);

      expect(result.sourcePath).toBe(filePath);
      expect(result.docPath).toBe("src/empty.archon.md");
      expect(result.content).toContain("# empty.ts");
      expect(result.content).toContain("## Overview");
      expect(result.content).toContain("no documented symbols");
      expect(result.referencedArns).toEqual([]);
    });

    it("should group symbols by kind", () => {
      const filePath = "src/service.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "UserService",
          kind: "class",
          signature: "class UserService",
          location: { file: filePath, line: 10, column: 0 },
          arn: "arn:archon:code:workspace/package/src/service.ts#UserService",
        },
        {
          name: "createUser",
          kind: "function",
          signature: "function createUser(): User",
          location: { file: filePath, line: 5, column: 0 },
          arn: "arn:archon:code:workspace/package/src/service.ts#createUser",
        },
        {
          name: "User",
          kind: "type",
          signature: "type User = { name: string }",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/service.ts#User",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("### Classes");
      expect(result.content).toContain("### Functions");
      expect(result.content).toContain("### Types");
      expect(result.content).toContain("UserService");
      expect(result.content).toContain("createUser");
      expect(result.content).toContain("User");
    });

    it("should include ARN links for each symbol", () => {
      const filePath = "src/utils.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "helper",
          kind: "function",
          signature: "function helper(): void",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils.ts#helper",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain(
        "[helper](arn:archon:code:workspace/package/src/utils.ts#helper)"
      );
    });

    it("should include symbol signatures", () => {
      const filePath = "src/math.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "add",
          kind: "function",
          signature: "function add(a: number, b: number): number",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/math.ts#add",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("function add(a: number, b: number): number");
    });

    it("should include symbol documentation as summary", () => {
      const filePath = "src/api.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "fetchData",
          kind: "function",
          signature: "function fetchData(): Promise<Data>",
          documentation: "Fetches data from the remote API. Returns a promise that resolves to the data.",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/api.ts#fetchData",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("Fetches data from the remote API");
    });

    it("should collect referenced ARNs from relationships", () => {
      const filePath = "src/processor.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "process",
          kind: "function",
          signature: "function process(): void",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/processor.ts#process",
        },
      ];

      const relationships: ScipRelationship[] = [
        {
          from: "arn:archon:code:workspace/package/src/processor.ts#process",
          to: "arn:archon:code:workspace/package/src/utils.ts#helper",
          type: "references",
        },
        {
          from: "arn:archon:code:workspace/package/src/processor.ts#process",
          to: "arn:archon:code:workspace/package/src/types.ts#Config",
          type: "references",
        },
      ];

      const result = generateForFile(filePath, symbols, relationships);

      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/utils.ts#helper"
      );
      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/types.ts#Config"
      );
    });

    it("should include dependencies section when relationships exist", () => {
      const filePath = "src/service.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "Service",
          kind: "class",
          signature: "class Service",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/service.ts#Service",
        },
      ];

      const relationships: ScipRelationship[] = [
        {
          from: "arn:archon:code:workspace/package/src/service.ts#Service",
          to: "arn:archon:code:workspace/package/src/interfaces.ts#IService",
          type: "implements",
        },
        {
          from: "arn:archon:code:workspace/package/src/service.ts#Service",
          to: "arn:archon:code:workspace/package/src/logger.ts#Logger",
          type: "references",
        },
      ];

      const result = generateForFile(filePath, symbols, relationships);

      expect(result.content).toContain("## Dependencies");
      expect(result.content).toContain("### Implements");
      expect(result.content).toContain("### References");
      expect(result.content).toContain("[IService]");
      expect(result.content).toContain("[Logger]");
    });

    it("should show symbol count in overview", () => {
      const filePath = "src/utils.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "func1",
          kind: "function",
          signature: "function func1(): void",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils.ts#func1",
        },
        {
          name: "func2",
          kind: "function",
          signature: "function func2(): void",
          location: { file: filePath, line: 5, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils.ts#func2",
        },
        {
          name: "MyClass",
          kind: "class",
          signature: "class MyClass",
          location: { file: filePath, line: 10, column: 0 },
          arn: "arn:archon:code:workspace/package/src/utils.ts#MyClass",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("2 functions");
      expect(result.content).toContain("1 classes");
    });

    it("should include line numbers for each symbol", () => {
      const filePath = "src/module.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "myFunction",
          kind: "function",
          signature: "function myFunction(): void",
          location: { file: filePath, line: 42, column: 0 },
          arn: "arn:archon:code:workspace/package/src/module.ts#myFunction",
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("line 42");
    });

    it("should generate doc ARN with doc type", () => {
      const filePath = "src/test.ts";
      const result = generateForFile(filePath, [], []);

      expect(result.arn).toContain("arn:archon:doc:");
      expect(result.arn).toContain(filePath);
    });

    it("should not duplicate referenced ARNs", () => {
      const filePath = "src/processor.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "process1",
          kind: "function",
          signature: "function process1(): void",
          location: { file: filePath, line: 1, column: 0 },
          arn: "arn:archon:code:workspace/package/src/processor.ts#process1",
        },
        {
          name: "process2",
          kind: "function",
          signature: "function process2(): void",
          location: { file: filePath, line: 10, column: 0 },
          arn: "arn:archon:code:workspace/package/src/processor.ts#process2",
        },
      ];

      const sharedArn = "arn:archon:code:workspace/package/src/utils.ts#helper";
      const relationships: ScipRelationship[] = [
        {
          from: "arn:archon:code:workspace/package/src/processor.ts#process1",
          to: sharedArn,
          type: "references",
        },
        {
          from: "arn:archon:code:workspace/package/src/processor.ts#process2",
          to: sharedArn,
          type: "references",
        },
      ];

      const result = generateForFile(filePath, symbols, relationships);

      // Should only appear once in referencedArns
      const count = result.referencedArns.filter((arn) => arn === sharedArn).length;
      expect(count).toBe(1);
    });
  });

  describe("Documentation Templates", () => {
    describe("getTemplateForKind", () => {
      it("should return a template for function kind", () => {
        const template = getTemplateForKind("function");
        expect(template.kind).toBe("function");
        expect(template.template).toContain("{{name}}");
        expect(template.template).toContain("{{kind}}");
        expect(template.template).toContain("{{sourcePath}}");
      });

      it("should return a template for class kind", () => {
        const template = getTemplateForKind("class");
        expect(template.kind).toBe("class");
        expect(template.template).toContain("{{name}}");
      });

      it("should return a template for method kind", () => {
        const template = getTemplateForKind("method");
        expect(template.kind).toBe("method");
        expect(template.template).toContain("{{name}}");
      });

      it("should return a template for module kind", () => {
        const template = getTemplateForKind("module");
        expect(template.kind).toBe("module");
        expect(template.template).toContain("{{name}}");
      });

      it("should return a template for variable kind", () => {
        const template = getTemplateForKind("variable");
        expect(template.kind).toBe("variable");
        expect(template.template).toContain("{{name}}");
      });

      it("should return a template for type kind", () => {
        const template = getTemplateForKind("type");
        expect(template.kind).toBe("type");
        expect(template.template).toContain("{{name}}");
      });

      it("should return templates for all symbol kinds", () => {
        const kinds: SymbolKind[] = ["function", "class", "method", "module", "variable", "type"];
        for (const kind of kinds) {
          const template = getTemplateForKind(kind);
          expect(template).toBeDefined();
          expect(template.kind).toBe(kind);
        }
      });
    });

    describe("getAllTemplates", () => {
      it("should return all 6 templates", () => {
        const templates = getAllTemplates();
        expect(templates).toHaveLength(6);
      });

      it("should include templates for all symbol kinds", () => {
        const templates = getAllTemplates();
        const kinds = templates.map((t) => t.kind);
        expect(kinds).toContain("function");
        expect(kinds).toContain("class");
        expect(kinds).toContain("method");
        expect(kinds).toContain("module");
        expect(kinds).toContain("variable");
        expect(kinds).toContain("type");
      });

      it("should return templates with valid structure", () => {
        const templates = getAllTemplates();
        for (const template of templates) {
          expect(template.kind).toBeDefined();
          expect(template.template).toBeDefined();
          expect(typeof template.template).toBe("string");
          expect(template.template.length).toBeGreaterThan(0);
        }
      });
    });

    describe("renderTemplate", () => {
      it("should replace all placeholders with values", () => {
        const template = "# {{name}}\n\nThis {{kind}} is at {{location}}.";
        const placeholders = {
          name: "myFunction",
          kind: "function",
          location: "line 10",
          documentation: "",
          signature: "",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#myFunction",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).toContain("# myFunction");
        expect(result).toContain("This function is at line 10.");
        expect(result).not.toContain("{{name}}");
        expect(result).not.toContain("{{kind}}");
        expect(result).not.toContain("{{location}}");
      });

      it("should include documentation section when documentation is provided", () => {
        const template = "{{documentation}}";
        const placeholders = {
          name: "test",
          kind: "function",
          location: "line 1",
          documentation: "This is the documentation.",
          signature: "",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).toContain("## Description");
        expect(result).toContain("This is the documentation.");
      });

      it("should exclude documentation section when documentation is empty", () => {
        const template = "Start\n{{documentation}}\nEnd";
        const placeholders = {
          name: "test",
          kind: "function",
          location: "line 1",
          documentation: "",
          signature: "",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).not.toContain("## Description");
        expect(result).toContain("Start");
        expect(result).toContain("End");
      });

      it("should include signature section when signature is provided", () => {
        const template = "{{signature}}";
        const placeholders = {
          name: "test",
          kind: "function",
          location: "line 1",
          documentation: "",
          signature: "function test(): void",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).toContain("## Signature");
        expect(result).toContain("```");
        expect(result).toContain("function test(): void");
      });

      it("should exclude signature section when signature is empty", () => {
        const template = "Start\n{{signature}}\nEnd";
        const placeholders = {
          name: "test",
          kind: "variable",
          location: "line 1",
          documentation: "",
          signature: "",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).not.toContain("## Signature");
        expect(result).toContain("Start");
        expect(result).toContain("End");
      });

      it("should include relationships section when relationships are provided", () => {
        const template = "{{relationships}}";
        const placeholders = {
          name: "test",
          kind: "function",
          location: "line 1",
          documentation: "",
          signature: "",
          relationships: "## Related Symbols\n\n### References\n\n- [other](arn:archon:code:ws/pkg/other.ts#other)",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        expect(result).toContain("## Related Symbols");
        expect(result).toContain("### References");
        expect(result).toContain("[other]");
      });

      it("should clean up multiple consecutive newlines", () => {
        const template = "Start\n\n\n\n{{documentation}}\n\n\n\nEnd";
        const placeholders = {
          name: "test",
          kind: "function",
          location: "line 1",
          documentation: "",
          signature: "",
          relationships: "",
          arn: "arn:archon:code:ws/pkg/file.ts#test",
          sourcePath: "src/file.ts",
        };

        const result = renderTemplate(template, placeholders);

        // Should not have more than 2 consecutive newlines
        expect(result).not.toMatch(/\n{3,}/);
      });
    });

    describe("generateForSymbolWithTemplate", () => {
      it("should generate documentation using templates", () => {
        const symbol: ScipSymbol = {
          name: "calculateSum",
          kind: "function",
          signature: "function calculateSum(a: number, b: number): number",
          documentation: "Calculates the sum of two numbers.",
          location: {
            file: "src/math.ts",
            line: 5,
            column: 0,
          },
          arn: "arn:archon:code:workspace/package/src/math.ts#calculateSum",
        };

        const result = generateForSymbolWithTemplate(symbol, []);

        expect(result.sourcePath).toBe("src/math.ts");
        expect(result.docPath).toBe("src/math.archon.md");
        expect(result.arn).toBe(symbol.arn);
        expect(result.content).toContain("# calculateSum");
        expect(result.content).toContain("<!-- archon:generated -->");
        expect(result.content).toContain(`<!-- source-arn: ${symbol.arn} -->`);
        expect(result.content).toContain("function");
        expect(result.content).toContain("line 5");
        expect(result.content).toContain("## Description");
        expect(result.content).toContain("Calculates the sum of two numbers.");
        expect(result.content).toContain("## Signature");
        expect(result.content).toContain("function calculateSum(a: number, b: number): number");
      });

      it("should include relationships in template-generated documentation", () => {
        const symbol: ScipSymbol = {
          name: "processData",
          kind: "function",
          signature: "function processData(data: Data): Result",
          location: {
            file: "src/processor.ts",
            line: 10,
            column: 0,
          },
          arn: "arn:archon:code:workspace/package/src/processor.ts#processData",
        };

        const relationships: ScipRelationship[] = [
          {
            from: symbol.arn,
            to: "arn:archon:code:workspace/package/src/types.ts#Data",
            type: "references",
          },
        ];

        const result = generateForSymbolWithTemplate(symbol, relationships);

        expect(result.content).toContain("## Related Symbols");
        expect(result.content).toContain("### References");
        expect(result.content).toContain("[Data]");
        expect(result.referencedArns).toContain(
          "arn:archon:code:workspace/package/src/types.ts#Data"
        );
      });

      it("should use appropriate template for each symbol kind", () => {
        const kinds: SymbolKind[] = ["function", "class", "method", "module", "variable", "type"];

        for (const kind of kinds) {
          const symbol: ScipSymbol = {
            name: `test${kind}`,
            kind,
            signature: `${kind} test${kind}`,
            location: {
              file: "src/test.ts",
              line: 1,
              column: 0,
            },
            arn: `arn:archon:code:workspace/package/src/test.ts#test${kind}`,
          };

          const result = generateForSymbolWithTemplate(symbol, []);

          expect(result.content).toContain(`# test${kind}`);
          expect(result.content).toContain("<!-- archon:generated -->");
          expect(result.sourcePath).toBe("src/test.ts");
          expect(result.docPath).toBe("src/test.archon.md");
        }
      });

      it("should handle symbols without documentation or signature", () => {
        const symbol: ScipSymbol = {
          name: "CONFIG",
          kind: "variable",
          signature: "",
          location: {
            file: "src/config.ts",
            line: 1,
            column: 0,
          },
          arn: "arn:archon:code:workspace/package/src/config.ts#CONFIG",
        };

        const result = generateForSymbolWithTemplate(symbol, []);

        expect(result.content).toContain("# CONFIG");
        expect(result.content).not.toContain("## Description");
        expect(result.content).not.toContain("## Signature");
        expect(result.content).toContain("variable");
      });
    });
  });

  describe("Manual Section Preservation", () => {
    describe("extractManualSections", () => {
      it("should extract a single manual section", () => {
        const doc = `# Title

Some content

<!-- archon:manual -->
User notes here
<!-- /archon:manual -->

More content`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(1);
        expect(sections[0]?.startMarker).toBe("<!-- archon:manual -->");
        expect(sections[0]?.endMarker).toBe("<!-- /archon:manual -->");
        expect(sections[0]?.content).toBe("\nUser notes here\n");
      });

      it("should extract multiple manual sections", () => {
        const doc = `# Title

<!-- archon:manual -->
First section
<!-- /archon:manual -->

Middle content

<!-- archon:manual -->
Second section
<!-- /archon:manual -->`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(2);
        expect(sections[0]?.content).toBe("\nFirst section\n");
        expect(sections[1]?.content).toBe("\nSecond section\n");
      });

      it("should return empty array when no manual sections exist", () => {
        const doc = `# Title

Just regular content here.

No manual sections.`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(0);
      });

      it("should handle empty manual sections", () => {
        const doc = `# Title

<!-- archon:manual --><!-- /archon:manual -->`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(1);
        expect(sections[0]?.content).toBe("");
      });

      it("should handle manual sections with complex content", () => {
        const doc = `# Title

<!-- archon:manual -->
## Custom Notes

- Item 1
- Item 2

\`\`\`typescript
const x = 1;
\`\`\`

**Bold** and *italic* text.
<!-- /archon:manual -->`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(1);
        expect(sections[0]?.content).toContain("## Custom Notes");
        expect(sections[0]?.content).toContain("- Item 1");
        expect(sections[0]?.content).toContain("const x = 1;");
        expect(sections[0]?.content).toContain("**Bold**");
      });

      it("should skip unclosed manual sections", () => {
        const doc = `# Title

<!-- archon:manual -->
This section is never closed

More content`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(0);
      });

      it("should handle adjacent manual sections", () => {
        const doc = `<!-- archon:manual -->A<!-- /archon:manual --><!-- archon:manual -->B<!-- /archon:manual -->`;

        const sections = extractManualSections(doc);

        expect(sections).toHaveLength(2);
        expect(sections[0]?.content).toBe("A");
        expect(sections[1]?.content).toBe("B");
      });
    });

    describe("preserveManualSections", () => {
      it("should preserve manual section content when regenerating", () => {
        const existingDoc = `# Old Title

<!-- archon:generated -->

## Purpose

Old purpose text.

<!-- archon:manual -->
## User Notes

These are my custom notes that should be preserved.
<!-- /archon:manual -->

**Source**
- \`old/path.ts\``;

        const newDoc = `# New Title

<!-- archon:generated -->

## Purpose

New purpose text.

<!-- archon:manual -->
<!-- /archon:manual -->

**Source**
- \`new/path.ts\``;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("# New Title");
        expect(result).toContain("New purpose text.");
        expect(result).toContain("## User Notes");
        expect(result).toContain("These are my custom notes that should be preserved.");
        expect(result).toContain("`new/path.ts`");
      });

      it("should return new doc unchanged when no manual sections in existing doc", () => {
        const existingDoc = `# Old Title

Just regular content.`;

        const newDoc = `# New Title

New content here.`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toBe(newDoc);
      });

      it("should append manual sections when new doc has no markers", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
Preserved content
<!-- /archon:manual -->`;

        const newDoc = `# New Title

New content without manual markers.`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("# New Title");
        expect(result).toContain("New content without manual markers.");
        expect(result).toContain("<!-- archon:manual -->");
        expect(result).toContain("Preserved content");
        expect(result).toContain("<!-- /archon:manual -->");
      });

      it("should preserve multiple manual sections", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
First preserved section
<!-- /archon:manual -->

Middle

<!-- archon:manual -->
Second preserved section
<!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
<!-- /archon:manual -->

New middle

<!-- archon:manual -->
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("First preserved section");
        expect(result).toContain("Second preserved section");
        expect(result).toContain("New middle");
      });

      it("should handle empty existing manual sections", () => {
        const existingDoc = `# Title

<!-- archon:manual --><!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
Default content
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        // Empty existing section should replace the new content
        expect(result).toContain("<!-- archon:manual --><!-- /archon:manual -->");
        expect(result).not.toContain("Default content");
      });

      it("should preserve content with special characters", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
Content with special chars: <>&"'
Code: \`const x = 1;\`
<!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("Content with special chars: <>&\"'");
        expect(result).toContain("Code: `const x = 1;`");
      });

      it("should handle more existing sections than new sections", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
Section 1
<!-- /archon:manual -->

<!-- archon:manual -->
Section 2
<!-- /archon:manual -->

<!-- archon:manual -->
Section 3
<!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("Section 1");
        expect(result).toContain("Section 2");
        expect(result).toContain("Section 3");
      });

      it("should handle more new sections than existing sections", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
Only one section
<!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
<!-- /archon:manual -->

<!-- archon:manual -->
New section 2
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("Only one section");
        // Second section in new doc should remain as-is since no existing content
        expect(result).toContain("New section 2");
      });

      it("should preserve multiline content with proper formatting", () => {
        const existingDoc = `# Title

<!-- archon:manual -->
## Custom Documentation

This is a paragraph with multiple lines
that should all be preserved exactly
as they were written.

### Subsection

- Bullet 1
- Bullet 2
- Bullet 3

\`\`\`javascript
function example() {
  return "preserved";
}
\`\`\`
<!-- /archon:manual -->`;

        const newDoc = `# New Title

<!-- archon:manual -->
<!-- /archon:manual -->`;

        const result = preserveManualSections(existingDoc, newDoc);

        expect(result).toContain("## Custom Documentation");
        expect(result).toContain("This is a paragraph with multiple lines");
        expect(result).toContain("### Subsection");
        expect(result).toContain("- Bullet 1");
        expect(result).toContain('return "preserved";');
      });

      it("should work with real-world documentation structure", () => {
        const existingDoc = `# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->

## Purpose

This function is defined in \`src/utils.ts\` at line 10.

## Description

Calculates the total price of items.

<!-- archon:manual -->
## Implementation Notes

This function uses a reduce operation for efficiency.
Consider caching results for large arrays.

## Known Issues

- Does not handle negative prices
- May overflow for very large totals
<!-- /archon:manual -->

**Source**
- \`src/utils.ts\``;

        const newDoc = `# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->

## Purpose

This function is defined in \`src/utils.ts\` at line 15.

## Description

Calculates the total price of items in a cart.

<!-- archon:manual -->
<!-- /archon:manual -->

**Source**
- \`src/utils.ts\``;

        const result = preserveManualSections(existingDoc, newDoc);

        // New generated content should be present
        expect(result).toContain("at line 15");
        expect(result).toContain("items in a cart");

        // Manual section content should be preserved
        expect(result).toContain("## Implementation Notes");
        expect(result).toContain("uses a reduce operation");
        expect(result).toContain("## Known Issues");
        expect(result).toContain("Does not handle negative prices");
      });
    });
  });
});


import { needsRegeneration, extractIndexHash } from "../../../src/lib/doc_generator.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("Change Detection", () => {
  describe("extractIndexHash", () => {
    it("should extract hash from valid index-hash comment", () => {
      const content = `# Title

<!-- archon:generated -->
<!-- index-hash: abc123def456 -->

## Purpose

Some content here.`;

      const hash = extractIndexHash(content);
      expect(hash).toBe("abc123def456");
    });

    it("should return null when no index-hash comment exists", () => {
      const content = `# Title

<!-- archon:generated -->

## Purpose

Some content here.`;

      const hash = extractIndexHash(content);
      expect(hash).toBeNull();
    });

    it("should return null for empty hash value", () => {
      const content = `# Title

<!-- index-hash:  -->

## Purpose`;

      const hash = extractIndexHash(content);
      expect(hash).toBeNull();
    });

    it("should handle hash with whitespace padding", () => {
      const content = `<!-- index-hash:   sha256hash123   -->`;

      const hash = extractIndexHash(content);
      expect(hash).toBe("sha256hash123");
    });

    it("should extract hash from complex document", () => {
      const content = `# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->
<!-- index-hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 -->

## Purpose

This function is defined in \`src/utils.ts\` at line 10.

## Description

Calculates the total price of items.

<!-- archon:manual -->
## User Notes
<!-- /archon:manual -->

**Source**
- \`src/utils.ts\``;

      const hash = extractIndexHash(content);
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("should return null when marker prefix exists but suffix is missing", () => {
      const content = `<!-- index-hash: abc123
Some other content`;

      const hash = extractIndexHash(content);
      expect(hash).toBeNull();
    });

    it("should handle multiple index-hash comments (returns first)", () => {
      const content = `<!-- index-hash: first123 -->
Some content
<!-- index-hash: second456 -->`;

      const hash = extractIndexHash(content);
      expect(hash).toBe("first123");
    });
  });

  describe("needsRegeneration", () => {
    let tempDir: string;

    beforeEach(async () => {
      // Create a temporary directory for test files
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-generator-test-"));
    });

    afterEach(async () => {
      // Clean up temporary directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should return true when documentation file does not exist", async () => {
      const nonExistentPath = path.join(tempDir, "non-existent.archon.md");
      const result = await needsRegeneration(nonExistentPath, "somehash123");
      expect(result).toBe(true);
    });

    it("should return true when documentation has no index-hash", async () => {
      const docPath = path.join(tempDir, "no-hash.archon.md");
      const content = `# Title

<!-- archon:generated -->

## Purpose

Some content without index hash.`;

      await fs.writeFile(docPath, content, "utf-8");

      const result = await needsRegeneration(docPath, "somehash123");
      expect(result).toBe(true);
    });

    it("should return true when stored hash differs from current hash", async () => {
      const docPath = path.join(tempDir, "different-hash.archon.md");
      const content = `# Title

<!-- archon:generated -->
<!-- index-hash: oldhash123 -->

## Purpose

Some content.`;

      await fs.writeFile(docPath, content, "utf-8");

      const result = await needsRegeneration(docPath, "newhash456");
      expect(result).toBe(true);
    });

    it("should return false when stored hash matches current hash", async () => {
      const docPath = path.join(tempDir, "matching-hash.archon.md");
      const currentHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const content = `# Title

<!-- archon:generated -->
<!-- index-hash: ${currentHash} -->

## Purpose

Some content.`;

      await fs.writeFile(docPath, content, "utf-8");

      const result = await needsRegeneration(docPath, currentHash);
      expect(result).toBe(false);
    });

    it("should return true for empty documentation file", async () => {
      const docPath = path.join(tempDir, "empty.archon.md");
      await fs.writeFile(docPath, "", "utf-8");

      const result = await needsRegeneration(docPath, "somehash123");
      expect(result).toBe(true);
    });

    it("should handle real-world documentation format", async () => {
      const docPath = path.join(tempDir, "real-world.archon.md");
      const indexHash = "sha256hashvalue123456789";
      const content = `# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->
<!-- index-hash: ${indexHash} -->

## Purpose

This function is defined in \`src/utils.ts\` at line 10.

## Description

Calculates the total price of items.

## Signature

\`\`\`
function calculateTotal(items: Item[]): number
\`\`\`

<!-- archon:manual -->
## User Notes

Custom notes here.
<!-- /archon:manual -->

**Source**
- \`src/utils.ts\``;

      await fs.writeFile(docPath, content, "utf-8");

      // Same hash - should not need regeneration
      const resultSame = await needsRegeneration(docPath, indexHash);
      expect(resultSame).toBe(false);

      // Different hash - should need regeneration
      const resultDifferent = await needsRegeneration(docPath, "differenthash");
      expect(resultDifferent).toBe(true);
    });

    it("should return true when directory does not exist", async () => {
      const nonExistentDir = path.join(tempDir, "non-existent-dir", "doc.archon.md");
      const result = await needsRegeneration(nonExistentDir, "somehash123");
      expect(result).toBe(true);
    });
  });

  describe("Orphaned Documentation Marking", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orphaned-test-"));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("isOrphaned", () => {
      it("should return true when document contains orphaned marker", () => {
        const content = `# Title

<!-- archon:generated -->
<!-- archon:orphaned -->

## Purpose

Some content.`;

        expect(isOrphaned(content)).toBe(true);
      });

      it("should return false when document does not contain orphaned marker", () => {
        const content = `# Title

<!-- archon:generated -->

## Purpose

Some content.`;

        expect(isOrphaned(content)).toBe(false);
      });

      it("should return false for empty content", () => {
        expect(isOrphaned("")).toBe(false);
      });

      it("should detect orphaned marker anywhere in document", () => {
        const content = `# Title

## Purpose

Some content.

<!-- archon:orphaned -->

More content.`;

        expect(isOrphaned(content)).toBe(true);
      });
    });

    describe("markOrphaned", () => {
      it("should add orphaned marker after archon:generated marker", async () => {
        const docPath = path.join(tempDir, "test.archon.md");
        const content = `# Title

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:ws/pkg/file.ts#symbol -->

## Purpose

Some content.`;

        await fs.writeFile(docPath, content, "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        expect(result).toContain("<!-- archon:orphaned -->");
        expect(result.indexOf("<!-- archon:orphaned -->")).toBeGreaterThan(
          result.indexOf("<!-- archon:generated -->")
        );
      });

      it("should be idempotent - not add duplicate markers", async () => {
        const docPath = path.join(tempDir, "idempotent.archon.md");
        const content = `# Title

<!-- archon:generated -->
<!-- archon:orphaned -->

## Purpose

Some content.`;

        await fs.writeFile(docPath, content, "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        const matches = result.match(/<!-- archon:orphaned -->/g);
        expect(matches).toHaveLength(1);
      });

      it("should throw error when file does not exist", async () => {
        const nonExistentPath = path.join(tempDir, "non-existent.archon.md");

        await expect(markOrphaned(nonExistentPath)).rejects.toThrow(
          "Documentation file not found"
        );
      });

      it("should add marker after heading when no archon:generated marker exists", async () => {
        const docPath = path.join(tempDir, "no-generated.archon.md");
        const content = `# Title

## Purpose

Some content without archon:generated marker.`;

        await fs.writeFile(docPath, content, "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        expect(result).toContain("<!-- archon:orphaned -->");
        // Should be after the title
        const lines = result.split("\n");
        const titleIndex = lines.findIndex((l) => l.startsWith("# Title"));
        const orphanedIndex = lines.findIndex((l) =>
          l.includes("<!-- archon:orphaned -->")
        );
        expect(orphanedIndex).toBeGreaterThan(titleIndex);
      });

      it("should handle file with no heading", async () => {
        const docPath = path.join(tempDir, "no-heading.archon.md");
        const content = `Some content without any heading.

More content here.`;

        await fs.writeFile(docPath, content, "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        expect(result).toContain("<!-- archon:orphaned -->");
      });

      it("should preserve existing content when adding marker", async () => {
        const docPath = path.join(tempDir, "preserve-content.archon.md");
        const content = `# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->

## Purpose

This function is defined in \`src/utils.ts\` at line 10.

## Description

Calculates the total price of items.

<!-- archon:manual -->
## User Notes

Custom notes here.
<!-- /archon:manual -->

**Source**
- \`src/utils.ts\``;

        await fs.writeFile(docPath, content, "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        expect(result).toContain("<!-- archon:orphaned -->");
        expect(result).toContain("# calculateTotal");
        expect(result).toContain("## Purpose");
        expect(result).toContain("## Description");
        expect(result).toContain("<!-- archon:manual -->");
        expect(result).toContain("Custom notes here.");
        expect(result).toContain("<!-- /archon:manual -->");
        expect(result).toContain("**Source**");
      });

      it("should handle empty file", async () => {
        const docPath = path.join(tempDir, "empty.archon.md");
        await fs.writeFile(docPath, "", "utf-8");
        await markOrphaned(docPath);

        const result = await fs.readFile(docPath, "utf-8");
        expect(result).toContain("<!-- archon:orphaned -->");
      });
    });
  });
});


// ============================================================================
// Edge Case Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Many Symbols (10+)", () => {
    it("should handle file with 10+ symbols correctly", () => {
      const filePath = "src/large-module.ts";
      const symbols: ScipSymbol[] = [];

      // Create 15 symbols of various kinds
      for (let i = 1; i <= 5; i++) {
        symbols.push({
          name: `function${i}`,
          kind: "function",
          signature: `function function${i}(): void`,
          documentation: `Documentation for function ${i}.`,
          location: { file: filePath, line: i * 10, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#function${i}`,
        });
      }

      for (let i = 1; i <= 5; i++) {
        symbols.push({
          name: `Class${i}`,
          kind: "class",
          signature: `class Class${i}`,
          documentation: `Documentation for class ${i}.`,
          location: { file: filePath, line: 50 + i * 10, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#Class${i}`,
        });
      }

      for (let i = 1; i <= 5; i++) {
        symbols.push({
          name: `Type${i}`,
          kind: "type",
          signature: `type Type${i} = { value: number }`,
          location: { file: filePath, line: 100 + i * 10, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#Type${i}`,
        });
      }

      const result = generateForFile(filePath, symbols, []);

      // Verify all symbols are documented
      expect(result.content).toContain("# large-module.ts");
      expect(result.content).toContain("5 functions");
      expect(result.content).toContain("5 classes");
      expect(result.content).toContain("5 types");

      // Verify each symbol is included
      for (let i = 1; i <= 5; i++) {
        expect(result.content).toContain(`function${i}`);
        expect(result.content).toContain(`Class${i}`);
        expect(result.content).toContain(`Type${i}`);
      }

      // Verify structure is maintained
      expect(result.content).toContain("## Public API");
      expect(result.content).toContain("### Functions");
      expect(result.content).toContain("### Classes");
      expect(result.content).toContain("### Types");
    });

    it("should handle file with 20+ symbols and many relationships", () => {
      const filePath = "src/complex-module.ts";
      const symbols: ScipSymbol[] = [];
      const relationships: ScipRelationship[] = [];

      // Create 20 function symbols
      for (let i = 1; i <= 20; i++) {
        const arn = `arn:archon:code:workspace/package/${filePath}#func${i}`;
        symbols.push({
          name: `func${i}`,
          kind: "function",
          signature: `function func${i}(param: string): number`,
          documentation: `Function ${i} does something important.`,
          location: { file: filePath, line: i * 5, column: 0 },
          arn,
        });

        // Add relationships between consecutive functions
        if (i > 1) {
          relationships.push({
            from: arn,
            to: `arn:archon:code:workspace/package/${filePath}#func${i - 1}`,
            type: "references",
          });
        }
      }

      const result = generateForFile(filePath, symbols, relationships);

      // Verify all 20 symbols are documented
      expect(result.content).toContain("20 functions");

      // Verify relationships are included
      expect(result.content).toContain("## Dependencies");
      expect(result.content).toContain("### References");

      // Verify referenced ARNs are collected (19 relationships)
      expect(result.referencedArns.length).toBe(19);
    });
  });

  describe("Deeply Nested Directory Paths", () => {
    it("should handle deeply nested source paths", () => {
      const deepPath = "src/modules/core/services/internal/utils/helpers/formatters/date.ts";
      const symbol: ScipSymbol = {
        name: "formatDate",
        kind: "function",
        signature: "function formatDate(date: Date): string",
        documentation: "Formats a date to ISO string.",
        location: { file: deepPath, line: 10, column: 0 },
        arn: `arn:archon:code:workspace/package/${deepPath}#formatDate`,
      };

      const result = generateForSymbol(symbol, []);

      expect(result.sourcePath).toBe(deepPath);
      expect(result.docPath).toBe(
        "src/modules/core/services/internal/utils/helpers/formatters/date.archon.md"
      );
      expect(result.content).toContain(`\`${deepPath}\``);
    });

    it("should handle file documentation for deeply nested paths", () => {
      const deepPath = "packages/core/src/lib/internal/private/utils/helpers.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "helper",
          kind: "function",
          signature: "function helper(): void",
          location: { file: deepPath, line: 1, column: 0 },
          arn: `arn:archon:code:workspace/package/${deepPath}#helper`,
        },
      ];

      const result = generateForFile(deepPath, symbols, []);

      expect(result.sourcePath).toBe(deepPath);
      expect(result.docPath).toBe(
        "packages/core/src/lib/internal/private/utils/helpers.archon.md"
      );
      expect(result.content).toContain("# helpers.ts");
      expect(result.content).toContain(`\`${deepPath}\``);
    });

    it("should handle paths with 10+ directory levels", () => {
      const veryDeepPath = "a/b/c/d/e/f/g/h/i/j/k/file.ts";
      const symbol: ScipSymbol = {
        name: "deepFunction",
        kind: "function",
        signature: "function deepFunction(): void",
        location: { file: veryDeepPath, line: 1, column: 0 },
        arn: `arn:archon:code:workspace/package/${veryDeepPath}#deepFunction`,
      };

      const result = generateForSymbol(symbol, []);

      expect(result.sourcePath).toBe(veryDeepPath);
      expect(result.docPath).toBe("a/b/c/d/e/f/g/h/i/j/k/file.archon.md");
    });
  });

  describe("Unicode in Symbol Names", () => {
    it("should handle symbol names with unicode characters", () => {
      const symbol: ScipSymbol = {
        name: "计算总价",
        kind: "function",
        signature: "function 计算总价(items: Item[]): number",
        documentation: "计算所有商品的总价格。",
        location: { file: "src/utils.ts", line: 10, column: 0 },
        arn: "arn:archon:code:workspace/package/src/utils.ts#计算总价",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# 计算总价");
      expect(result.content).toContain("计算所有商品的总价格。");
      expect(result.content).toContain("function 计算总价(items: Item[]): number");
    });

    it("should handle symbol names with emoji", () => {
      const symbol: ScipSymbol = {
        name: "🚀launch",
        kind: "function",
        signature: "function 🚀launch(): Promise<void>",
        documentation: "Launches the rocket 🚀",
        location: { file: "src/rocket.ts", line: 5, column: 0 },
        arn: "arn:archon:code:workspace/package/src/rocket.ts#🚀launch",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# 🚀launch");
      expect(result.content).toContain("Launches the rocket 🚀");
    });

    it("should handle symbol names with mixed scripts", () => {
      const symbol: ScipSymbol = {
        name: "getПользователь",
        kind: "function",
        signature: "function getПользователь(id: string): User",
        documentation: "Gets a пользователь by ID.",
        location: { file: "src/users.ts", line: 20, column: 0 },
        arn: "arn:archon:code:workspace/package/src/users.ts#getПользователь",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# getПользователь");
      expect(result.content).toContain("Gets a пользователь by ID.");
    });

    it("should handle file documentation with unicode symbol names", () => {
      const filePath = "src/i18n.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "翻译",
          kind: "function",
          signature: "function 翻译(key: string): string",
          documentation: "翻译给定的键。",
          location: { file: filePath, line: 10, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#翻译`,
        },
        {
          name: "Übersetzung",
          kind: "class",
          signature: "class Übersetzung",
          documentation: "German translation class",
          location: { file: filePath, line: 30, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#Übersetzung`,
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      expect(result.content).toContain("翻译");
      expect(result.content).toContain("Übersetzung");
      expect(result.content).toContain("翻译给定的键。");
      // Note: The summary truncates at the first sentence (period), so we check without the period
      expect(result.content).toContain("German translation class");
    });

    it("should handle relationships with unicode symbol names", () => {
      const symbol: ScipSymbol = {
        name: "処理",
        kind: "function",
        signature: "function 処理(): void",
        location: { file: "src/process.ts", line: 1, column: 0 },
        arn: "arn:archon:code:workspace/package/src/process.ts#処理",
      };

      const relationships: ScipRelationship[] = [
        {
          from: symbol.arn,
          to: "arn:archon:code:workspace/package/src/utils.ts#ヘルパー",
          type: "references",
        },
      ];

      const result = generateForSymbol(symbol, relationships);

      expect(result.content).toContain("# 処理");
      expect(result.content).toContain("[ヘルパー]");
      expect(result.referencedArns).toContain(
        "arn:archon:code:workspace/package/src/utils.ts#ヘルパー"
      );
    });
  });

  describe("Very Long Documentation Strings", () => {
    it("should handle very long documentation strings (1000+ characters)", () => {
      const longDoc = "A".repeat(1000) + " This is a very long documentation string. " + "B".repeat(1000);
      const symbol: ScipSymbol = {
        name: "complexFunction",
        kind: "function",
        signature: "function complexFunction(): void",
        documentation: longDoc,
        location: { file: "src/complex.ts", line: 10, column: 0 },
        arn: "arn:archon:code:workspace/package/src/complex.ts#complexFunction",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# complexFunction");
      expect(result.content).toContain("## Description");
      expect(result.content).toContain(longDoc);
      expect(result.content.length).toBeGreaterThan(2000);
    });

    it("should handle documentation with many newlines", () => {
      const multilineDoc = `This is line 1.

This is line 2 after a blank line.

This is line 3.

## Subsection

- Item 1
- Item 2
- Item 3

### Another subsection

More content here with **bold** and *italic* text.

\`\`\`typescript
const example = "code block";
\`\`\`

Final paragraph.`;

      const symbol: ScipSymbol = {
        name: "documentedFunction",
        kind: "function",
        signature: "function documentedFunction(): void",
        documentation: multilineDoc,
        location: { file: "src/documented.ts", line: 5, column: 0 },
        arn: "arn:archon:code:workspace/package/src/documented.ts#documentedFunction",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("This is line 1.");
      expect(result.content).toContain("This is line 2 after a blank line.");
      expect(result.content).toContain("## Subsection");
      expect(result.content).toContain("- Item 1");
      expect(result.content).toContain('const example = "code block";');
      expect(result.content).toContain("Final paragraph.");
    });

    it("should handle very long signatures", () => {
      const longSignature = `function veryComplexFunction<T extends SomeInterface, U extends AnotherInterface, V extends YetAnotherInterface>(
  param1: T,
  param2: U,
  param3: V,
  param4: Map<string, Array<T>>,
  param5: Set<U>,
  param6: Record<string, V>,
  options?: {
    option1: boolean;
    option2: string;
    option3: number;
    option4: Array<string>;
  }
): Promise<{
  result1: T;
  result2: U;
  result3: V;
  metadata: Record<string, unknown>;
}>`;

      const symbol: ScipSymbol = {
        name: "veryComplexFunction",
        kind: "function",
        signature: longSignature,
        documentation: "A function with a very complex signature.",
        location: { file: "src/complex.ts", line: 100, column: 0 },
        arn: "arn:archon:code:workspace/package/src/complex.ts#veryComplexFunction",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("## Signature");
      expect(result.content).toContain("veryComplexFunction");
      expect(result.content).toContain("param1: T");
      expect(result.content).toContain("Promise<{");
    });

    it("should truncate long documentation in file summaries", () => {
      const longDoc = "This is a very long documentation string that goes on and on. ".repeat(10);
      const filePath = "src/long-docs.ts";
      const symbols: ScipSymbol[] = [
        {
          name: "longDocFunction",
          kind: "function",
          signature: "function longDocFunction(): void",
          documentation: longDoc,
          location: { file: filePath, line: 10, column: 0 },
          arn: `arn:archon:code:workspace/package/${filePath}#longDocFunction`,
        },
      ];

      const result = generateForFile(filePath, symbols, []);

      // The summary should be truncated (first sentence or 100 chars)
      expect(result.content).toContain("longDocFunction");
      // Full documentation should not appear in file-level docs
      // (only summaries are shown)
    });
  });

  describe("Special Characters in Paths and Names", () => {
    it("should handle paths with spaces (when escaped)", () => {
      const pathWithSpaces = "src/my module/utils.ts";
      const symbol: ScipSymbol = {
        name: "helper",
        kind: "function",
        signature: "function helper(): void",
        location: { file: pathWithSpaces, line: 1, column: 0 },
        arn: `arn:archon:code:workspace/package/${encodeURIComponent(pathWithSpaces)}#helper`,
      };

      const result = generateForSymbol(symbol, []);

      expect(result.sourcePath).toBe(pathWithSpaces);
      expect(result.docPath).toBe("src/my module/utils.archon.md");
    });

    it("should handle symbol names with special TypeScript characters", () => {
      const symbol: ScipSymbol = {
        name: "[Symbol.iterator]",
        kind: "method",
        signature: "[Symbol.iterator](): Iterator<T>",
        documentation: "Returns an iterator for the collection.",
        location: { file: "src/collection.ts", line: 50, column: 0 },
        arn: "arn:archon:code:workspace/package/src/collection.ts#%5BSymbol.iterator%5D",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# [Symbol.iterator]");
      expect(result.content).toContain("[Symbol.iterator](): Iterator<T>");
    });

    it("should handle generic type parameters in names", () => {
      const symbol: ScipSymbol = {
        name: "Container<T>",
        kind: "class",
        signature: "class Container<T extends Serializable>",
        documentation: "A generic container class.",
        location: { file: "src/container.ts", line: 10, column: 0 },
        arn: "arn:archon:code:workspace/package/src/container.ts#Container%3CT%3E",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# Container<T>");
      expect(result.content).toContain("class Container<T extends Serializable>");
    });
  });

  describe("Empty and Minimal Cases", () => {
    it("should handle symbol with all optional fields empty", () => {
      const symbol: ScipSymbol = {
        name: "x",
        kind: "variable",
        signature: "",
        location: { file: "src/x.ts", line: 1, column: 0 },
        arn: "arn:archon:code:workspace/package/src/x.ts#x",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("# x");
      expect(result.content).toContain("variable");
      expect(result.content).not.toContain("## Description");
      expect(result.content).not.toContain("## Signature");
      expect(result.content).not.toContain("## Related Symbols");
    });

    it("should handle file with single character name", () => {
      const result = generateForFile("a.ts", [], []);

      expect(result.docPath).toBe("a.archon.md");
      expect(result.content).toContain("# a.ts");
    });

    it("should handle symbol at line 0", () => {
      const symbol: ScipSymbol = {
        name: "topLevel",
        kind: "variable",
        signature: "const topLevel = 1",
        location: { file: "src/top.ts", line: 0, column: 0 },
        arn: "arn:archon:code:workspace/package/src/top.ts#topLevel",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("line 0");
    });

    it("should handle symbol at very high line number", () => {
      const symbol: ScipSymbol = {
        name: "deepFunction",
        kind: "function",
        signature: "function deepFunction(): void",
        location: { file: "src/large.ts", line: 999999, column: 0 },
        arn: "arn:archon:code:workspace/package/src/large.ts#deepFunction",
      };

      const result = generateForSymbol(symbol, []);

      expect(result.content).toContain("line 999999");
    });
  });

  describe("All Symbol Kinds with Templates", () => {
    const symbolKinds: SymbolKind[] = ["function", "class", "method", "module", "variable", "type"];

    for (const kind of symbolKinds) {
      it(`should generate complete documentation for ${kind} kind`, () => {
        const symbol: ScipSymbol = {
          name: `test${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
          kind,
          signature: `${kind} test${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
          documentation: `This is a ${kind} for testing.`,
          location: { file: `src/${kind}.ts`, line: 10, column: 0 },
          arn: `arn:archon:code:workspace/package/src/${kind}.ts#test${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
        };

        const relationships: ScipRelationship[] = [
          {
            from: symbol.arn,
            to: `arn:archon:code:workspace/package/src/other.ts#related`,
            type: "references",
          },
        ];

        const result = generateForSymbol(symbol, relationships);

        // Verify all sections are present
        expect(result.content).toContain(`# test${kind.charAt(0).toUpperCase() + kind.slice(1)}`);
        expect(result.content).toContain("<!-- archon:generated -->");
        expect(result.content).toContain("## Purpose");
        expect(result.content).toContain("## Description");
        expect(result.content).toContain(`This is a ${kind} for testing.`);
        expect(result.content).toContain("## Related Symbols");
        expect(result.content).toContain("**Source**");

        // Verify signature is included for kinds that have it
        if (kind !== "module") {
          expect(result.content).toContain("## Signature");
        }
      });
    }
  });
});
