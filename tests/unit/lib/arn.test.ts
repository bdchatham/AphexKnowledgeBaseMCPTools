/**
 * Unit Tests for ARN Library
 *
 * Tests for the ARN generation, parsing, validation, and utility functions.
 * Covers edge cases, error cases, and validates requirements 2.1-2.8.
 *
 * @see Requirements 2.1-2.8
 */

import {
  generate,
  parse,
  validate,
  normalizePath,
  escapeSymbol,
  unescapeSymbol,
} from "../../../src/lib/arn.js";
import type { ArnComponents } from "../../../src/types/arn.js";

describe("ARN Library", () => {
  describe("generate", () => {
    /**
     * Tests for ARN generation function.
     * Validates: Requirements 2.2, 2.4
     */

    it("should generate a valid ARN with all components", () => {
      const components: ArnComponents = {
        type: "code",
        workspace: "personal-work",
        package: "AphexKnowledgeBaseMCPTools",
        path: "src/lib/arn.ts",
        symbol: "generate",
      };

      const arn = generate(components);
      expect(arn).toBe(
        "arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#generate"
      );
    });

    it("should generate ARN without symbol when symbol is undefined", () => {
      const components: ArnComponents = {
        type: "doc",
        workspace: "my-workspace",
        package: "my-package",
        path: "docs/readme.md",
      };

      const arn = generate(components);
      expect(arn).toBe("arn:archon:doc:my-workspace/my-package/docs/readme.md");
    });

    it("should generate ARN without symbol when symbol is empty string", () => {
      const components: ArnComponents = {
        type: "code",
        workspace: "workspace",
        package: "package",
        path: "file.ts",
        symbol: "",
      };

      const arn = generate(components);
      expect(arn).toBe("arn:archon:code:workspace/package/file.ts");
    });

    it("should support all valid ARN types", () => {
      const types = ["code", "doc", "k8s", "infra"] as const;

      types.forEach((type) => {
        const components: ArnComponents = {
          type,
          workspace: "ws",
          package: "pkg",
          path: "path",
        };
        const arn = generate(components);
        expect(arn).toContain(`arn:archon:${type}:`);
      });
    });

    it("should be deterministic - same inputs produce same output", () => {
      const components: ArnComponents = {
        type: "code",
        workspace: "workspace",
        package: "package",
        path: "src/file.ts",
        symbol: "MyClass",
      };

      const arn1 = generate(components);
      const arn2 = generate(components);
      const arn3 = generate(components);

      expect(arn1).toBe(arn2);
      expect(arn2).toBe(arn3);
    });

    it("should escape special characters in symbol", () => {
      const components: ArnComponents = {
        type: "code",
        workspace: "ws",
        package: "pkg",
        path: "file.ts",
        symbol: "path/to#symbol%name",
      };

      const arn = generate(components);
      expect(arn).toContain("path%2Fto%23symbol%25name");
    });

    it("should normalize path in generated ARN", () => {
      const components: ArnComponents = {
        type: "code",
        workspace: "ws",
        package: "pkg",
        path: "./src/../src/lib/arn.ts",
        symbol: "test",
      };

      const arn = generate(components);
      expect(arn).toBe("arn:archon:code:ws/pkg/src/lib/arn.ts#test");
    });

    describe("edge cases", () => {
      it("should handle empty path", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "pkg",
          path: "",
        };

        const arn = generate(components);
        expect(arn).toBe("arn:archon:code:ws/pkg/");
      });

      it("should handle very long paths", () => {
        const longPath = "a/".repeat(100) + "file.ts";
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "pkg",
          path: longPath,
        };

        const arn = generate(components);
        expect(arn).toContain(longPath.replace(/\.\.\//g, ""));
      });

      it("should handle unicode in workspace name", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "工作区",
          package: "pkg",
          path: "file.ts",
        };

        const arn = generate(components);
        expect(arn).toContain("工作区");
      });

      it("should handle unicode in package name", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "包名",
          path: "file.ts",
        };

        const arn = generate(components);
        expect(arn).toContain("包名");
      });

      it("should handle unicode in path", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "pkg",
          path: "文件/路径.ts",
        };

        const arn = generate(components);
        expect(arn).toContain("文件/路径.ts");
      });

      it("should handle unicode in symbol", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "pkg",
          path: "file.ts",
          symbol: "函数名",
        };

        const arn = generate(components);
        expect(arn).toContain("函数名");
      });

      it("should handle emoji in symbol", () => {
        const components: ArnComponents = {
          type: "code",
          workspace: "ws",
          package: "pkg",
          path: "file.ts",
          symbol: "test🚀function",
        };

        const arn = generate(components);
        expect(arn).toContain("test🚀function");
      });
    });
  });

  describe("parse", () => {
    /**
     * Tests for ARN parsing function.
     * Validates: Requirement 2.5
     */

    it("should parse a valid ARN with symbol", () => {
      const arn =
        "arn:archon:code:personal-work/AphexKnowledgeBaseMCPTools/src/lib/arn.ts#generate";
      const result = parse(arn);

      expect(result).toEqual({
        type: "code",
        workspace: "personal-work",
        package: "AphexKnowledgeBaseMCPTools",
        path: "src/lib/arn.ts",
        symbol: "generate",
      });
    });

    it("should parse a valid ARN without symbol", () => {
      const arn = "arn:archon:doc:my-workspace/my-package/docs/readme.md";
      const result = parse(arn);

      expect(result).toEqual({
        type: "doc",
        workspace: "my-workspace",
        package: "my-package",
        path: "docs/readme.md",
        symbol: undefined,
      });
    });

    it("should parse ARNs with all valid types", () => {
      const types = ["code", "doc", "k8s", "infra"] as const;

      types.forEach((type) => {
        const arn = `arn:archon:${type}:ws/pkg/path`;
        const result = parse(arn);
        expect(result?.type).toBe(type);
      });
    });

    it("should unescape special characters in symbol", () => {
      const arn = "arn:archon:code:ws/pkg/file.ts#path%2Fto%23symbol%25name";
      const result = parse(arn);

      expect(result?.symbol).toBe("path/to#symbol%name");
    });

    it("should handle paths with multiple slashes", () => {
      const arn = "arn:archon:code:ws/pkg/src/lib/deep/nested/file.ts#symbol";
      const result = parse(arn);

      expect(result?.path).toBe("src/lib/deep/nested/file.ts");
    });

    describe("error cases - returns null", () => {
      it("should return null for empty string", () => {
        expect(parse("")).toBeNull();
      });

      it("should return null for null input", () => {
        expect(parse(null as unknown as string)).toBeNull();
      });

      it("should return null for undefined input", () => {
        expect(parse(undefined as unknown as string)).toBeNull();
      });

      it("should return null for non-string input", () => {
        expect(parse(123 as unknown as string)).toBeNull();
        expect(parse({} as unknown as string)).toBeNull();
        expect(parse([] as unknown as string)).toBeNull();
      });

      it("should return null for ARN without correct prefix", () => {
        expect(parse("invalid:archon:code:ws/pkg/path")).toBeNull();
        expect(parse("arn:invalid:code:ws/pkg/path")).toBeNull();
        expect(parse("arn:ws/pkg/path")).toBeNull();
      });

      it("should return null for ARN with invalid type", () => {
        expect(parse("arn:archon:invalid:ws/pkg/path")).toBeNull();
        expect(parse("arn:archon:CODE:ws/pkg/path")).toBeNull();
        expect(parse("arn:archon:Doc:ws/pkg/path")).toBeNull();
      });

      it("should return null for ARN missing workspace", () => {
        expect(parse("arn:archon:code:/pkg/path")).toBeNull();
      });

      it("should return null for ARN missing package", () => {
        expect(parse("arn:archon:code:ws//path")).toBeNull();
      });

      it("should return null for ARN missing path", () => {
        expect(parse("arn:archon:code:ws/pkg/")).toBeNull();
      });

      it("should return null for ARN with only workspace", () => {
        expect(parse("arn:archon:code:ws")).toBeNull();
      });

      it("should return null for ARN with only workspace and package", () => {
        expect(parse("arn:archon:code:ws/pkg")).toBeNull();
      });

      it("should return null for ARN missing type separator", () => {
        expect(parse("arn:archon:codews/pkg/path")).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle ARN with empty symbol after hash", () => {
        const arn = "arn:archon:code:ws/pkg/file.ts#";
        const result = parse(arn);
        expect(result?.symbol).toBeUndefined();
      });

      it("should handle unicode in parsed components", () => {
        const arn = "arn:archon:code:工作区/包名/文件.ts#函数";
        const result = parse(arn);

        expect(result).toEqual({
          type: "code",
          workspace: "工作区",
          package: "包名",
          path: "文件.ts",
          symbol: "函数",
        });
      });
    });
  });

  describe("validate", () => {
    /**
     * Tests for ARN validation function.
     * Validates: Requirement 2.6
     */

    it("should return valid for a correct ARN with symbol", () => {
      const result = validate(
        "arn:archon:code:ws/pkg/src/file.ts#MyClass"
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return valid for a correct ARN without symbol", () => {
      const result = validate("arn:archon:doc:ws/pkg/docs/readme.md");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should validate all valid ARN types", () => {
      const types = ["code", "doc", "k8s", "infra"];

      types.forEach((type) => {
        const result = validate(`arn:archon:${type}:ws/pkg/path`);
        expect(result.valid).toBe(true);
      });
    });

    describe("error cases with descriptive messages", () => {
      it("should return error for empty string", () => {
        const result = validate("");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN must be a non-empty string");
      });

      it("should return error for null input", () => {
        const result = validate(null as unknown as string);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN must be a non-empty string");
      });

      it("should return error for undefined input", () => {
        const result = validate(undefined as unknown as string);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN must be a non-empty string");
      });

      it("should return error for non-string input", () => {
        const result = validate(123 as unknown as string);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN must be a non-empty string");
      });

      it("should return error for ARN without correct prefix", () => {
        const result = validate("invalid:archon:code:ws/pkg/path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN must start with 'arn:archon:'");
      });

      it("should return error for ARN missing type separator", () => {
        const result = validate("arn:archon:codews/pkg/path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN is missing type separator ':'");
      });

      it("should return error for ARN with empty type", () => {
        const result = validate("arn:archon::ws/pkg/path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN is missing type component");
      });

      it("should return error for ARN with invalid type", () => {
        const result = validate("arn:archon:invalid:ws/pkg/path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid ARN type: invalid. Valid types are: code, doc, k8s, infra"
        );
      });

      it("should return error for ARN missing resource path", () => {
        const result = validate("arn:archon:code:");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("ARN is missing resource path");
      });

      it("should return error for ARN missing workspace", () => {
        const result = validate("arn:archon:code:/pkg/path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Missing workspace component");
      });

      it("should return error for ARN missing package", () => {
        const result = validate("arn:archon:code:ws//path");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Missing package component");
      });

      it("should return error for ARN missing path", () => {
        const result = validate("arn:archon:code:ws/pkg/");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Missing path component");
      });

      it("should return error for ARN with only workspace", () => {
        const result = validate("arn:archon:code:ws");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Missing workspace component");
      });

      it("should return error for ARN with only workspace and package", () => {
        const result = validate("arn:archon:code:ws/pkg");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Missing package component");
      });
    });
  });

  describe("normalizePath", () => {
    /**
     * Tests for path normalization function.
     * Validates: Requirement 2.7
     */

    it("should remove leading ./", () => {
      expect(normalizePath("./src/file.ts")).toBe("src/file.ts");
    });

    it("should remove multiple leading ./", () => {
      expect(normalizePath("././././src/file.ts")).toBe("src/file.ts");
    });

    it("should resolve .. segments", () => {
      expect(normalizePath("src/../lib/file.ts")).toBe("lib/file.ts");
    });

    it("should resolve multiple .. segments", () => {
      expect(normalizePath("src/deep/../../lib/file.ts")).toBe("lib/file.ts");
    });

    it("should handle combined ./ and .. segments", () => {
      expect(normalizePath("./src/../lib/./file.ts")).toBe("lib/file.ts");
    });

    it("should normalize backslashes to forward slashes", () => {
      expect(normalizePath("src\\lib\\file.ts")).toBe("src/lib/file.ts");
    });

    it("should remove redundant slashes", () => {
      expect(normalizePath("src//lib///file.ts")).toBe("src/lib/file.ts");
    });

    it("should drop leading .. segments (cannot go above root)", () => {
      expect(normalizePath("../src/file.ts")).toBe("src/file.ts");
      expect(normalizePath("../../src/file.ts")).toBe("src/file.ts");
    });

    it("should handle .. that goes above root in middle of path", () => {
      expect(normalizePath("src/../../file.ts")).toBe("file.ts");
    });

    describe("edge cases", () => {
      it("should return empty string for empty input", () => {
        expect(normalizePath("")).toBe("");
      });

      it("should return empty string for null input", () => {
        expect(normalizePath(null as unknown as string)).toBe("");
      });

      it("should return empty string for undefined input", () => {
        expect(normalizePath(undefined as unknown as string)).toBe("");
      });

      it("should return empty string for path that is just '.'", () => {
        expect(normalizePath(".")).toBe("");
      });

      it("should return empty string for path that is just '..'", () => {
        expect(normalizePath("..")).toBe("");
      });

      it("should handle path with only slashes", () => {
        expect(normalizePath("///")).toBe("");
      });

      it("should handle very long paths", () => {
        const longPath = "a/b/c/".repeat(50) + "file.ts";
        const result = normalizePath(longPath);
        expect(result).toBe(longPath.replace(/\/+/g, "/"));
      });

      it("should preserve unicode in paths", () => {
        expect(normalizePath("./文件/路径.ts")).toBe("文件/路径.ts");
      });

      it("should handle mixed separators", () => {
        expect(normalizePath(".\\src/lib\\file.ts")).toBe("src/lib/file.ts");
      });
    });
  });

  describe("escapeSymbol", () => {
    /**
     * Tests for symbol escaping function.
     * Validates: Requirement 2.8
     */

    it("should escape forward slash", () => {
      expect(escapeSymbol("path/to/symbol")).toBe("path%2Fto%2Fsymbol");
    });

    it("should escape hash", () => {
      expect(escapeSymbol("symbol#name")).toBe("symbol%23name");
    });

    it("should escape percent", () => {
      expect(escapeSymbol("100%complete")).toBe("100%25complete");
    });

    it("should escape all special characters together", () => {
      expect(escapeSymbol("path/to#symbol%name")).toBe(
        "path%2Fto%23symbol%25name"
      );
    });

    it("should not modify strings without special characters", () => {
      expect(escapeSymbol("normalSymbol")).toBe("normalSymbol");
      expect(escapeSymbol("MyClass.myMethod")).toBe("MyClass.myMethod");
    });

    describe("edge cases", () => {
      it("should return empty string for empty input", () => {
        expect(escapeSymbol("")).toBe("");
      });

      it("should return falsy value for null input", () => {
        expect(escapeSymbol(null as unknown as string)).toBeFalsy();
      });

      it("should return falsy value for undefined input", () => {
        expect(escapeSymbol(undefined as unknown as string)).toBeFalsy();
      });

      it("should handle unicode symbols", () => {
        expect(escapeSymbol("函数/名称")).toBe("函数%2F名称");
      });

      it("should handle emoji in symbols", () => {
        expect(escapeSymbol("test🚀/function")).toBe("test🚀%2Ffunction");
      });

      it("should handle multiple consecutive special characters", () => {
        expect(escapeSymbol("///###%%%")).toBe(
          "%2F%2F%2F%23%23%23%25%25%25"
        );
      });

      it("should handle very long symbols", () => {
        const longSymbol = "a/b#c%".repeat(100);
        const escaped = escapeSymbol(longSymbol);
        expect(escaped).not.toContain("/");
        expect(escaped).not.toContain("#");
        expect(escaped).toContain("%2F");
        expect(escaped).toContain("%23");
        expect(escaped).toContain("%25");
      });
    });
  });

  describe("unescapeSymbol", () => {
    /**
     * Tests for symbol unescaping function.
     * Validates: Requirement 2.8
     */

    it("should unescape forward slash", () => {
      expect(unescapeSymbol("path%2Fto%2Fsymbol")).toBe("path/to/symbol");
    });

    it("should unescape hash", () => {
      expect(unescapeSymbol("symbol%23name")).toBe("symbol#name");
    });

    it("should unescape percent", () => {
      expect(unescapeSymbol("100%25complete")).toBe("100%complete");
    });

    it("should unescape all special characters together", () => {
      expect(unescapeSymbol("path%2Fto%23symbol%25name")).toBe(
        "path/to#symbol%name"
      );
    });

    it("should not modify strings without escape sequences", () => {
      expect(unescapeSymbol("normalSymbol")).toBe("normalSymbol");
      expect(unescapeSymbol("MyClass.myMethod")).toBe("MyClass.myMethod");
    });

    describe("edge cases", () => {
      it("should return empty string for empty input", () => {
        expect(unescapeSymbol("")).toBe("");
      });

      it("should return falsy value for null input", () => {
        expect(unescapeSymbol(null as unknown as string)).toBeFalsy();
      });

      it("should return falsy value for undefined input", () => {
        expect(unescapeSymbol(undefined as unknown as string)).toBeFalsy();
      });

      it("should handle unicode symbols", () => {
        expect(unescapeSymbol("函数%2F名称")).toBe("函数/名称");
      });

      it("should handle case-sensitive escape sequences", () => {
        // The implementation uses uppercase escape sequences
        expect(unescapeSymbol("test%2fvalue")).toBe("test%2fvalue");
        expect(unescapeSymbol("test%2Fvalue")).toBe("test/value");
      });
    });
  });

  describe("round-trip consistency", () => {
    /**
     * Tests for generate -> parse round-trip consistency.
     * Validates: Requirements 2.4, 2.5
     */

    it("should preserve components through generate -> parse", () => {
      const original: ArnComponents = {
        type: "code",
        workspace: "personal-work",
        package: "AphexKnowledgeBaseMCPTools",
        path: "src/lib/arn.ts",
        symbol: "generate",
      };

      const arn = generate(original);
      const parsed = parse(arn);

      expect(parsed).toEqual(original);
    });

    it("should preserve components without symbol through round-trip", () => {
      const original: ArnComponents = {
        type: "doc",
        workspace: "my-workspace",
        package: "my-package",
        path: "docs/readme.md",
      };

      const arn = generate(original);
      const parsed = parse(arn);

      expect(parsed).toEqual(original);
    });

    it("should preserve special characters in symbol through round-trip", () => {
      const original: ArnComponents = {
        type: "code",
        workspace: "ws",
        package: "pkg",
        path: "file.ts",
        symbol: "path/to#symbol%name",
      };

      const arn = generate(original);
      const parsed = parse(arn);

      expect(parsed?.symbol).toBe(original.symbol);
    });

    it("should preserve unicode through round-trip", () => {
      const original: ArnComponents = {
        type: "code",
        workspace: "工作区",
        package: "包名",
        path: "文件/路径.ts",
        symbol: "函数名",
      };

      const arn = generate(original);
      const parsed = parse(arn);

      expect(parsed).toEqual(original);
    });
  });

  describe("escape/unescape round-trip", () => {
    /**
     * Tests for escapeSymbol -> unescapeSymbol round-trip consistency.
     * Validates: Requirement 2.8
     */

    it("should preserve symbol through escape -> unescape", () => {
      const symbols = [
        "normalSymbol",
        "path/to/symbol",
        "symbol#name",
        "100%complete",
        "path/to#symbol%name",
        "函数/名称#测试%完成",
      ];

      symbols.forEach((symbol) => {
        const escaped = escapeSymbol(symbol);
        const unescaped = unescapeSymbol(escaped);
        expect(unescaped).toBe(symbol);
      });
    });
  });
});
