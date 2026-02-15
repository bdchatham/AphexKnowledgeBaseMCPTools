/**
 * Property-Based Tests for ARN Library
 *
 * Tests Property 6: ARN Format Compliance
 * Tests Property 7: ARN Round-Trip Consistency
 * Tests Property 8: ARN Validation
 *
 * Property 6: For any valid ARN components (type, workspace, package, path, symbol),
 * the generated ARN SHALL match the format `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
 * and SHALL only accept valid type values (code, doc, k8s, infra).
 *
 * Property 7: For any valid ARN components, generating an ARN and then parsing it back
 * SHALL return the original components unchanged. This implies determinism (same inputs → same ARN).
 *
 * Property 8: For any malformed ARN string (missing components, invalid format, unknown type),
 * the ARN library SHALL return a validation error with a descriptive message.
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
 *
 * @see Design Document: Property 6: ARN Format Compliance
 * @see Design Document: Property 7: ARN Round-Trip Consistency
 * @see Design Document: Property 8: ARN Validation
 */

import * as fc from "fast-check";
import {
  generate,
  parse,
  validate,
  escapeSymbol,
  unescapeSymbol,
  normalizePath,
} from "../../src/lib/arn.js";
import type { ArnComponents, ArnType } from "../../src/types/arn.js";

/**
 * Valid ARN types as defined in Requirements 2.3
 */
const VALID_ARN_TYPES: ArnType[] = ["code", "doc", "k8s", "infra"];

/**
 * Arbitrary for generating valid ARN types
 */
const arnTypeArb = fc.constantFrom(...VALID_ARN_TYPES);

/**
 * Arbitrary for generating valid workspace names
 * - Non-empty strings
 * - No forward slashes (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No hash symbols (would break ARN parsing)
 */
const workspaceArb = fc
  .stringOf(
    fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating valid package names
 * - Non-empty strings
 * - No forward slashes (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No hash symbols (would break ARN parsing)
 */
const packageArb = fc
  .stringOf(
    fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating valid path segments
 * - Non-empty strings
 * - No hash symbols (would break ARN parsing)
 * - No colons (would break ARN parsing)
 * - No slashes (would create extra path segments)
 * - Not just dots or whitespace (would normalize to empty)
 */
const pathSegmentArb = fc
  .stringOf(
    fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
    { minLength: 1, maxLength: 30 }
  )
  .filter((s) => s.trim().length > 0 && s !== "." && s !== ".." && !/^\.+$/.test(s));

/**
 * Arbitrary for generating valid file paths
 * - At least one segment
 * - Segments joined by forward slashes
 * - Path must not normalize to empty string
 */
const pathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join("/"))
  .filter((p) => normalizePath(p).length > 0);

/**
 * Arbitrary for generating valid symbol names
 * - Can contain special characters that will be escaped
 * - Non-empty strings
 */
const symbolArb = fc
  .stringOf(fc.char().filter((c) => c !== "\0"), { minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for generating optional symbol (undefined or valid symbol)
 */
const optionalSymbolArb = fc.option(symbolArb, { nil: undefined });

/**
 * Arbitrary for generating complete valid ARN components
 */
const arnComponentsArb: fc.Arbitrary<ArnComponents> = fc.record({
  type: arnTypeArb,
  workspace: workspaceArb,
  package: packageArb,
  path: pathArb,
  symbol: optionalSymbolArb,
});

/**
 * Arbitrary for generating ARN components with normalized paths
 * This ensures the path is already in canonical form for round-trip testing
 */
const normalizedArnComponentsArb: fc.Arbitrary<ArnComponents> = fc.record({
  type: arnTypeArb,
  workspace: workspaceArb,
  package: packageArb,
  path: pathArb.map((p) => normalizePath(p)),
  symbol: optionalSymbolArb,
});

describe("Feature: documentation-tools, Property 6: ARN Format Compliance", () => {
  /**
   * Property 6.1: Generated ARN matches expected format
   *
   * For any valid ARN components, the generated ARN SHALL match the format
   * `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
   *
   * **Validates: Requirement 2.2**
   */
  it("should generate ARN matching format arn:archon:<type>:<workspace>/<package>/<path>#<symbol>", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn = generate(components);

        // Verify ARN starts with correct prefix
        expect(arn.startsWith("arn:archon:")).toBe(true);

        // Verify ARN contains the type
        expect(arn).toContain(`:${components.type}:`);

        // Verify ARN contains workspace
        expect(arn).toContain(components.workspace);

        // Verify ARN contains package
        expect(arn).toContain(components.package);

        // Verify basic format structure
        const parts = arn.split(":");
        expect(parts[0]).toBe("arn");
        expect(parts[1]).toBe("archon");
        expect(parts[2]).toBe(components.type);

        // The resource path should be in parts[3]
        const resourcePath = parts.slice(3).join(":");
        expect(resourcePath.length).toBeGreaterThan(0);

        // If symbol is provided, verify it appears after #
        if (components.symbol !== undefined && components.symbol !== "") {
          expect(arn).toContain("#");
          const escapedSymbol = escapeSymbol(components.symbol);
          expect(arn.endsWith(`#${escapedSymbol}`)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.2: Only valid type values are accepted in generated ARNs
   *
   * The generated ARN SHALL only contain valid type values: code, doc, k8s, infra
   *
   * **Validates: Requirement 2.3**
   */
  it("should only generate ARNs with valid type values (code, doc, k8s, infra)", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn = generate(components);

        // Parse the ARN to extract the type
        const parsed = parse(arn);
        expect(parsed).not.toBeNull();

        // Verify the type is one of the valid values
        expect(VALID_ARN_TYPES).toContain(parsed!.type);

        // Verify the type matches the input
        expect(parsed!.type).toBe(components.type);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.3: ARN format structure is consistent
   *
   * For any valid ARN components, the generated ARN SHALL have exactly:
   * - Prefix "arn:archon:"
   * - Type followed by ":"
   * - Workspace followed by "/"
   * - Package followed by "/"
   * - Path (optionally followed by "#" and symbol)
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  it("should generate ARN with consistent structure: prefix:type:workspace/package/path[#symbol]", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn = generate(components);

        // Split by the first occurrence of each delimiter
        const prefix = "arn:archon:";
        expect(arn.startsWith(prefix)).toBe(true);

        const afterPrefix = arn.slice(prefix.length);

        // Find type (ends at first colon)
        const typeEndIndex = afterPrefix.indexOf(":");
        expect(typeEndIndex).toBeGreaterThan(0);

        const type = afterPrefix.slice(0, typeEndIndex);
        expect(VALID_ARN_TYPES).toContain(type as ArnType);

        // After type: should be workspace/package/path[#symbol]
        const resourcePath = afterPrefix.slice(typeEndIndex + 1);

        // Should contain at least two slashes (workspace/package/path)
        const slashCount = (resourcePath.match(/\//g) || []).length;
        expect(slashCount).toBeGreaterThanOrEqual(2);

        // First segment is workspace
        const firstSlash = resourcePath.indexOf("/");
        const workspace = resourcePath.slice(0, firstSlash);
        expect(workspace.length).toBeGreaterThan(0);

        // Second segment is package
        const afterWorkspace = resourcePath.slice(firstSlash + 1);
        const secondSlash = afterWorkspace.indexOf("/");
        const pkg = afterWorkspace.slice(0, secondSlash);
        expect(pkg.length).toBeGreaterThan(0);

        // Rest is path (and optional symbol)
        const pathAndSymbol = afterWorkspace.slice(secondSlash + 1);
        expect(pathAndSymbol.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.4: Validation accepts all generated ARNs
   *
   * For any valid ARN components, the generated ARN SHALL pass validation
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  it("should generate ARNs that pass validation", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn = generate(components);
        const validationResult = validate(arn);

        expect(validationResult.valid).toBe(true);
        expect(validationResult.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.5: Invalid types are rejected by validation
   *
   * ARNs with invalid type values SHALL be rejected by validation
   *
   * **Validates: Requirement 2.3**
   */
  it("should reject ARNs with invalid type values", () => {
    // Generate invalid type values that are not in the valid set
    const invalidTypeArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter(
        (s) =>
          !VALID_ARN_TYPES.includes(s as ArnType) &&
          !s.includes(":") &&
          !s.includes("/") &&
          !s.includes("#")
      );

    fc.assert(
      fc.property(
        invalidTypeArb,
        workspaceArb,
        packageArb,
        pathArb,
        (invalidType, workspace, pkg, path) => {
          // Manually construct an ARN with invalid type
          const invalidArn = `arn:archon:${invalidType}:${workspace}/${pkg}/${path}`;

          const validationResult = validate(invalidArn);

          // Should be invalid
          expect(validationResult.valid).toBe(false);

          // Error message should mention invalid type
          expect(validationResult.error).toBeDefined();
          expect(validationResult.error).toContain("Invalid ARN type");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.6: Each valid type produces correctly formatted ARN
   *
   * For each valid type value, the generated ARN SHALL contain that type
   * in the correct position
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  it("should correctly format ARN for each valid type value", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        workspaceArb,
        packageArb,
        pathArb,
        optionalSymbolArb,
        (type, workspace, pkg, path, symbol) => {
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path,
            symbol,
          };

          const arn = generate(components);

          // Verify the type appears in the correct position
          const expectedTypePosition = `arn:archon:${type}:`;
          expect(arn.startsWith(expectedTypePosition)).toBe(true);

          // Parse and verify type is preserved
          const parsed = parse(arn);
          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe(type);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.7: ARN format is deterministic
   *
   * For any valid ARN components, generating the ARN multiple times
   * SHALL produce identical results
   *
   * **Validates: Requirement 2.2**
   */
  it("should generate identical ARN for same components (determinism)", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn1 = generate(components);
        const arn2 = generate(components);
        const arn3 = generate(components);

        expect(arn1).toBe(arn2);
        expect(arn2).toBe(arn3);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: documentation-tools, Property 7: ARN Round-Trip Consistency
 *
 * For any valid ARN components, generating an ARN and then parsing it back
 * SHALL return the original components unchanged. This implies determinism
 * (same inputs → same ARN).
 *
 * **Validates: Requirements 2.4, 2.5**
 *
 * @see Design Document: Property 7: ARN Round-Trip Consistency
 */
describe("Feature: documentation-tools, Property 7: ARN Round-Trip Consistency", () => {
  /**
   * Property 7.1: Generate → Parse returns original components
   *
   * For any valid ARN components, generating an ARN and then parsing it back
   * SHALL return the original components unchanged.
   *
   * Note: Paths are normalized during generation, so we use pre-normalized paths
   * for this test to ensure exact equality.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should return original components when generate → parse (round-trip)", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        // Generate ARN from components
        const arn = generate(components);

        // Parse the ARN back to components
        const parsed = parse(arn);

        // Parsing should succeed
        expect(parsed).not.toBeNull();

        // All components should match the original
        expect(parsed!.type).toBe(components.type);
        expect(parsed!.workspace).toBe(components.workspace);
        expect(parsed!.package).toBe(components.package);
        expect(parsed!.path).toBe(components.path);

        // Symbol comparison: handle undefined vs missing
        if (components.symbol !== undefined && components.symbol !== "") {
          expect(parsed!.symbol).toBe(components.symbol);
        } else {
          expect(parsed!.symbol).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.2: Determinism - same inputs always produce same ARN
   *
   * For any valid ARN components, generating the ARN multiple times
   * SHALL always produce identical results.
   *
   * **Validates: Requirement 2.4**
   */
  it("should produce identical ARN for same inputs (determinism)", () => {
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        // Generate ARN multiple times with same components
        const arn1 = generate(components);
        const arn2 = generate(components);
        const arn3 = generate(components);
        const arn4 = generate(components);
        const arn5 = generate(components);

        // All generated ARNs should be identical
        expect(arn1).toBe(arn2);
        expect(arn2).toBe(arn3);
        expect(arn3).toBe(arn4);
        expect(arn4).toBe(arn5);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.3: Round-trip preserves type component
   *
   * For any valid ARN type, the type component SHALL be preserved
   * through generate → parse round-trip.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should preserve type component through round-trip", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        workspaceArb,
        packageArb,
        pathArb,
        optionalSymbolArb,
        (type, workspace, pkg, path, symbol) => {
          const components: ArnComponents = {
            type,
            workspace,
            package: pkg,
            path: normalizePath(path),
            symbol,
          };

          const arn = generate(components);
          const parsed = parse(arn);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe(type);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.4: Round-trip preserves workspace component
   *
   * For any valid workspace name, the workspace component SHALL be preserved
   * through generate → parse round-trip.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should preserve workspace component through round-trip", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        const arn = generate(components);
        const parsed = parse(arn);

        expect(parsed).not.toBeNull();
        expect(parsed!.workspace).toBe(components.workspace);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.5: Round-trip preserves package component
   *
   * For any valid package name, the package component SHALL be preserved
   * through generate → parse round-trip.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should preserve package component through round-trip", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        const arn = generate(components);
        const parsed = parse(arn);

        expect(parsed).not.toBeNull();
        expect(parsed!.package).toBe(components.package);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.6: Round-trip preserves path component (after normalization)
   *
   * For any valid path, the path component SHALL be preserved
   * through generate → parse round-trip (after normalization).
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should preserve path component through round-trip (after normalization)", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        const arn = generate(components);
        const parsed = parse(arn);

        expect(parsed).not.toBeNull();
        expect(parsed!.path).toBe(components.path);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.7: Round-trip preserves symbol component (with escaping)
   *
   * For any valid symbol (including those with special characters),
   * the symbol component SHALL be preserved through generate → parse round-trip.
   * Special characters are escaped during generation and unescaped during parsing.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should preserve symbol component through round-trip (with escaping)", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        const arn = generate(components);
        const parsed = parse(arn);

        expect(parsed).not.toBeNull();

        // Symbol comparison: handle undefined vs missing
        if (components.symbol !== undefined && components.symbol !== "") {
          expect(parsed!.symbol).toBe(components.symbol);
        } else {
          expect(parsed!.symbol).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.8: Double round-trip produces identical results
   *
   * For any valid ARN components, performing generate → parse → generate → parse
   * SHALL produce identical results to a single generate → parse.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should produce identical results for double round-trip", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        // First round-trip
        const arn1 = generate(components);
        const parsed1 = parse(arn1);
        expect(parsed1).not.toBeNull();

        // Second round-trip using parsed components
        const arn2 = generate(parsed1!);
        const parsed2 = parse(arn2);
        expect(parsed2).not.toBeNull();

        // Both ARNs should be identical
        expect(arn1).toBe(arn2);

        // Both parsed results should be identical
        expect(parsed1!.type).toBe(parsed2!.type);
        expect(parsed1!.workspace).toBe(parsed2!.workspace);
        expect(parsed1!.package).toBe(parsed2!.package);
        expect(parsed1!.path).toBe(parsed2!.path);
        expect(parsed1!.symbol).toBe(parsed2!.symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.9: Determinism across different component combinations
   *
   * For any two sets of identical ARN components, generating ARNs
   * SHALL produce identical results regardless of when they are generated.
   *
   * **Validates: Requirement 2.4**
   */
  it("should produce identical ARN for identical component objects", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        // Create a copy of the components (different object, same values)
        const componentsCopy: ArnComponents = {
          type: components.type,
          workspace: components.workspace,
          package: components.package,
          path: components.path,
          symbol: components.symbol,
        };

        const arn1 = generate(components);
        const arn2 = generate(componentsCopy);

        // Both should produce identical ARNs
        expect(arn1).toBe(arn2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.10: Parse result can be used to regenerate identical ARN
   *
   * For any valid ARN, parsing it and then regenerating from the parsed
   * components SHALL produce the original ARN.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it("should regenerate identical ARN from parsed components", () => {
    fc.assert(
      fc.property(normalizedArnComponentsArb, (components) => {
        const originalArn = generate(components);
        const parsed = parse(originalArn);

        expect(parsed).not.toBeNull();

        const regeneratedArn = generate(parsed!);

        expect(regeneratedArn).toBe(originalArn);
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: documentation-tools, Property 8: ARN Validation
 *
 * For any malformed ARN string (missing components, invalid format, unknown type),
 * the ARN library SHALL return a validation error with a descriptive message.
 *
 * **Validates: Requirement 2.6**
 *
 * @see Design Document: Property 8: ARN Validation
 */
describe("Feature: documentation-tools, Property 8: ARN Validation", () => {
  /**
   * Arbitrary for generating invalid ARN prefixes
   * - Strings that don't start with "arn:archon:"
   */
  const invalidPrefixArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !s.startsWith("arn:archon:"));

  /**
   * Arbitrary for generating invalid type values
   * - Non-empty strings that are not valid ARN types
   * - Excludes characters that would break parsing
   */
  const invalidTypeArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter(
      (s) =>
        !VALID_ARN_TYPES.includes(s as ArnType) &&
        !s.includes(":") &&
        !s.includes("/") &&
        !s.includes("#") &&
        s.trim().length > 0
    );

  /**
   * Arbitrary for generating non-empty strings without special ARN characters
   */
  const safeStringArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter(
      (s) =>
        !s.includes(":") &&
        !s.includes("/") &&
        !s.includes("#") &&
        s.trim().length > 0
    );

  /**
   * Property 8.1: ARNs with invalid prefix are rejected
   *
   * For any string that doesn't start with "arn:archon:", validation SHALL
   * return an error indicating the invalid prefix.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs with invalid prefix", () => {
    fc.assert(
      fc.property(invalidPrefixArb, (invalidArn) => {
        const result = validate(invalidArn);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.2: ARNs with unknown type values are rejected
   *
   * For any ARN with a type value not in (code, doc, k8s, infra), validation
   * SHALL return an error indicating the invalid type.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs with unknown type values", () => {
    fc.assert(
      fc.property(
        invalidTypeArb,
        safeStringArb,
        safeStringArb,
        safeStringArb,
        (invalidType, workspace, pkg, path) => {
          const malformedArn = `arn:archon:${invalidType}:${workspace}/${pkg}/${path}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain("Invalid ARN type");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.3: ARNs missing workspace component are rejected
   *
   * For any ARN missing the workspace component (no content before first slash),
   * validation SHALL return an error indicating the missing workspace.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs missing workspace component", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        safeStringArb,
        safeStringArb,
        (type, pkg, path) => {
          // ARN with empty workspace (starts with /)
          const malformedArn = `arn:archon:${type}:/${pkg}/${path}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.toLowerCase()).toContain("workspace");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.4: ARNs missing package component are rejected
   *
   * For any ARN missing the package component (no content between first and second slash),
   * validation SHALL return an error indicating the missing package.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs missing package component", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        safeStringArb,
        safeStringArb,
        (type, workspace, path) => {
          // ARN with empty package (double slash after workspace)
          const malformedArn = `arn:archon:${type}:${workspace}//${path}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.toLowerCase()).toContain("package");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.5: ARNs missing path component are rejected
   *
   * For any ARN missing the path component (nothing after package/),
   * validation SHALL return an error indicating the missing path.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs missing path component", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        safeStringArb,
        safeStringArb,
        (type, workspace, pkg) => {
          // ARN with empty path (ends after package/)
          const malformedArn = `arn:archon:${type}:${workspace}/${pkg}/`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.toLowerCase()).toContain("path");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.6: ARNs missing type separator are rejected
   *
   * For any ARN missing the colon after the type, validation SHALL
   * return an error indicating the malformed format.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs missing type separator", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        safeStringArb,
        safeStringArb,
        safeStringArb,
        (type, workspace, pkg, path) => {
          // ARN without colon after type (missing separator)
          const malformedArn = `arn:archon:${type}${workspace}/${pkg}/${path}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.7: ARNs with only workspace (missing package and path) are rejected
   *
   * For any ARN with only workspace component (no slashes after type:),
   * validation SHALL return an error.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs with only workspace (missing package and path)", () => {
    fc.assert(
      fc.property(arnTypeArb, safeStringArb, (type, workspace) => {
        // ARN with only workspace, no package or path
        const malformedArn = `arn:archon:${type}:${workspace}`;
        const result = validate(malformedArn);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.8: ARNs with workspace and package but missing path are rejected
   *
   * For any ARN with workspace and package but no path (only one slash),
   * validation SHALL return an error indicating missing path.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs with workspace and package but missing path", () => {
    fc.assert(
      fc.property(
        arnTypeArb,
        safeStringArb,
        safeStringArb,
        (type, workspace, pkg) => {
          // ARN with workspace/package but no path (only one slash)
          const malformedArn = `arn:archon:${type}:${workspace}/${pkg}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.9: Empty string ARNs are rejected
   *
   * Empty strings SHALL be rejected with a descriptive error.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject empty string ARNs", () => {
    const result = validate("");

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });

  /**
   * Property 8.10: ARNs missing resource path entirely are rejected
   *
   * For any ARN with valid prefix and type but no resource path,
   * validation SHALL return an error.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs missing resource path entirely", () => {
    fc.assert(
      fc.property(arnTypeArb, (type) => {
        // ARN with type but no resource path
        const malformedArn = `arn:archon:${type}:`;
        const result = validate(malformedArn);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.11: Validation errors are descriptive
   *
   * For any malformed ARN, the error message SHALL be non-empty and
   * provide meaningful information about the validation failure.
   *
   * **Validates: Requirement 2.6**
   */
  it("should provide descriptive error messages for malformed ARNs", () => {
    // Test various malformed ARN patterns
    const malformedPatterns = [
      "", // Empty string
      "not-an-arn", // Random string
      "arn:", // Incomplete prefix
      "arn:archon:", // Missing type and resource
      "arn:archon:invalid:", // Invalid type
      "arn:archon:code:", // Missing resource path
      "arn:archon:code:workspace", // Missing package and path
      "arn:archon:code:workspace/", // Missing package and path (trailing slash)
      "arn:archon:code:workspace/pkg", // Missing path
      "arn:archon:code:/pkg/path", // Empty workspace
      "arn:archon:code:workspace//path", // Empty package
      "arn:archon:code:workspace/pkg/", // Empty path
    ];

    for (const malformed of malformedPatterns) {
      const result = validate(malformed);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 8.12: Parse returns null for malformed ARNs
   *
   * For any malformed ARN that fails validation, parse SHALL return null.
   *
   * **Validates: Requirement 2.6**
   */
  it("should return null from parse for malformed ARNs", () => {
    fc.assert(
      fc.property(invalidPrefixArb, (malformedArn) => {
        const validationResult = validate(malformedArn);

        // If validation fails, parse should return null
        if (!validationResult.valid) {
          const parseResult = parse(malformedArn);
          expect(parseResult).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.13: Validation and parse are consistent
   *
   * For any string, if validation returns valid=true, parse SHALL return
   * non-null components. If validation returns valid=false, parse SHALL
   * return null.
   *
   * **Validates: Requirement 2.6**
   */
  it("should have consistent validation and parse results", () => {
    // Test with valid ARNs
    fc.assert(
      fc.property(arnComponentsArb, (components) => {
        const arn = generate(components);
        const validationResult = validate(arn);
        const parseResult = parse(arn);

        // Valid ARNs should pass validation and parse successfully
        expect(validationResult.valid).toBe(true);
        expect(parseResult).not.toBeNull();
      }),
      { numRuns: 100 }
    );

    // Test with invalid ARNs
    fc.assert(
      fc.property(invalidPrefixArb, (malformedArn) => {
        const validationResult = validate(malformedArn);
        const parseResult = parse(malformedArn);

        // Invalid ARNs should fail validation and parse should return null
        expect(validationResult.valid).toBe(false);
        expect(parseResult).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.14: ARNs with missing type component are rejected
   *
   * For any ARN with empty type (double colon after archon),
   * validation SHALL return an error.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject ARNs with missing type component", () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        safeStringArb,
        (workspace, pkg, path) => {
          // ARN with empty type (double colon)
          const malformedArn = `arn:archon::${workspace}/${pkg}/${path}`;
          const result = validate(malformedArn);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.15: Randomly generated malformed ARNs are rejected
   *
   * For any randomly generated string that doesn't follow the ARN format,
   * validation SHALL return an error.
   *
   * **Validates: Requirement 2.6**
   */
  it("should reject randomly generated malformed ARNs", () => {
    // Generate random strings that are unlikely to be valid ARNs
    const randomStringArb = fc.string({ minLength: 0, maxLength: 100 });

    fc.assert(
      fc.property(randomStringArb, (randomString) => {
        const result = validate(randomString);

        // If it's not a valid ARN format, it should fail validation
        // We check by trying to parse it - if parse returns null, validation should fail
        const parseResult = parse(randomString);

        if (parseResult === null) {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        } else {
          // If parse succeeds, validation should also succeed
          expect(result.valid).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: documentation-tools, Property 9: ARN Component Normalization
 *
 * For any path containing `./` or `..` segments, the ARN library SHALL normalize
 * to a canonical form. For any symbol containing special characters (`/`, `#`, `%`),
 * the library SHALL escape and unescape correctly, preserving the original symbol
 * through round-trip.
 *
 * **Validates: Requirements 2.7, 2.8**
 *
 * @see Design Document: Property 9: ARN Component Normalization
 */
describe("Feature: documentation-tools, Property 9: ARN Component Normalization", () => {
  /**
   * Arbitrary for generating path segments that can include ./ and .. segments
   * for testing normalization
   */
  const pathSegmentWithDotsArb = fc.oneof(
    // Normal path segments
    fc
      .stringOf(
        fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
        { minLength: 1, maxLength: 20 }
      )
      .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
    // Current directory reference
    fc.constant("."),
    // Parent directory reference
    fc.constant("..")
  );

  /**
   * Arbitrary for generating paths with ./ and .. segments
   * These paths need normalization
   */
  const pathWithDotsArb = fc
    .array(pathSegmentWithDotsArb, { minLength: 1, maxLength: 8 })
    .map((segments) => segments.join("/"))
    .filter((p) => p.length > 0);

  /**
   * Arbitrary for generating paths with leading ./
   */
  const pathWithLeadingDotSlashArb = fc
    .tuple(
      fc.integer({ min: 1, max: 5 }),
      fc.array(
        fc
          .stringOf(
            fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
            { minLength: 1, maxLength: 15 }
          )
          .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
        { minLength: 1, maxLength: 5 }
      )
    )
    .map(([dotCount, segments]) => {
      const prefix = "./".repeat(dotCount);
      return prefix + segments.join("/");
    });

  /**
   * Arbitrary for generating paths with .. segments in the middle
   */
  const pathWithParentRefsArb = fc
    .tuple(
      fc.array(
        fc
          .stringOf(
            fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
            { minLength: 1, maxLength: 15 }
          )
          .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
        { minLength: 1, maxLength: 3 }
      ),
      fc.integer({ min: 1, max: 3 }),
      fc.array(
        fc
          .stringOf(
            fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
            { minLength: 1, maxLength: 15 }
          )
          .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
        { minLength: 1, maxLength: 3 }
      )
    )
    .map(([before, dotDotCount, after]) => {
      const dotDots = Array(dotDotCount).fill("..").join("/");
      return [...before, dotDots, ...after].join("/");
    });

  /**
   * Arbitrary for generating paths with backslashes (Windows-style)
   */
  const pathWithBackslashesArb = fc
    .array(
      fc
        .stringOf(
          fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
          { minLength: 1, maxLength: 15 }
        )
        .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
      { minLength: 2, maxLength: 5 }
    )
    .map((segments) => segments.join("\\"));

  /**
   * Arbitrary for generating paths with redundant slashes
   */
  const pathWithRedundantSlashesArb = fc
    .array(
      fc
        .stringOf(
          fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0" && c !== "/" && c !== "\\"),
          { minLength: 1, maxLength: 15 }
        )
        .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
      { minLength: 2, maxLength: 5 }
    )
    .map((segments) => {
      // Join with random number of slashes (2-4)
      return segments.reduce((acc, seg, i) => {
        if (i === 0) return seg;
        const slashes = "/".repeat(2 + (i % 3));
        return acc + slashes + seg;
      }, "");
    });

  /**
   * Arbitrary for generating symbols with special characters (/, #, %)
   */
  const symbolWithSpecialCharsArb = fc
    .tuple(
      fc.array(
        fc.oneof(
          // Normal characters
          fc
            .stringOf(
              fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"),
              { minLength: 1, maxLength: 10 }
            )
            .filter((s) => s.length > 0),
          // Special characters
          fc.constant("/"),
          fc.constant("#"),
          fc.constant("%")
        ),
        { minLength: 2, maxLength: 8 }
      )
    )
    .map(([parts]) => parts.join(""))
    .filter((s) => s.length > 0 && (s.includes("/") || s.includes("#") || s.includes("%")));

  /**
   * Arbitrary for generating symbols with only forward slashes
   */
  const symbolWithSlashesArb = fc
    .tuple(
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      })
    )
    .map(([a, b]) => `${a}/${b}`);

  /**
   * Arbitrary for generating symbols with only hash characters
   */
  const symbolWithHashesArb = fc
    .tuple(
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      })
    )
    .map(([a, b]) => `${a}#${b}`);

  /**
   * Arbitrary for generating symbols with only percent characters
   */
  const symbolWithPercentsArb = fc
    .tuple(
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
        minLength: 1,
        maxLength: 10,
      })
    )
    .map(([a, b]) => `${a}%${b}`);

  // ============================================================================
  // Path Normalization Tests (Requirement 2.7)
  // Note: normalizePath, escapeSymbol, unescapeSymbol are imported at the top of the file
  // ============================================================================

  /**
   * Property 9.1: Paths with ./ segments are normalized to canonical form
   *
   * For any path containing leading ./ segments, normalization SHALL remove
   * all leading ./ prefixes.
   *
   * **Validates: Requirement 2.7**
   */
  it("should normalize paths with leading ./ segments to canonical form", () => {
    fc.assert(
      fc.property(pathWithLeadingDotSlashArb, (path) => {
        const normalized = normalizePath(path);

        // Normalized path should not start with ./
        expect(normalized.startsWith("./")).toBe(false);

        // Normalized path should not contain /./
        expect(normalized.includes("/./")).toBe(false);

        // Normalized path should not be just "."
        if (normalized.length > 0) {
          expect(normalized).not.toBe(".");
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.2: Paths with .. segments are resolved correctly
   *
   * For any path containing .. segments, normalization SHALL resolve
   * parent directory references by removing the preceding segment.
   *
   * **Validates: Requirement 2.7**
   */
  it("should resolve .. segments in paths to canonical form", () => {
    fc.assert(
      fc.property(pathWithParentRefsArb, (path) => {
        const normalized = normalizePath(path);

        // Normalized path should not contain .. segments
        // (unless they couldn't be resolved, which shouldn't happen with our generator)
        const segments = normalized.split("/");
        const hasUnresolvedDotDot = segments.some((s) => s === "..");
        expect(hasUnresolvedDotDot).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.3: Backslashes are converted to forward slashes
   *
   * For any path containing backslashes (Windows-style), normalization
   * SHALL convert all backslashes to forward slashes.
   *
   * **Validates: Requirement 2.7**
   */
  it("should convert backslashes to forward slashes", () => {
    fc.assert(
      fc.property(pathWithBackslashesArb, (path) => {
        const normalized = normalizePath(path);

        // Normalized path should not contain backslashes
        expect(normalized.includes("\\")).toBe(false);

        // If original had content, normalized should have content
        if (path.replace(/\\/g, "").length > 0) {
          expect(normalized.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.4: Redundant slashes are removed
   *
   * For any path containing multiple consecutive slashes, normalization
   * SHALL reduce them to single slashes.
   *
   * **Validates: Requirement 2.7**
   */
  it("should remove redundant slashes from paths", () => {
    fc.assert(
      fc.property(pathWithRedundantSlashesArb, (path) => {
        const normalized = normalizePath(path);

        // Normalized path should not contain consecutive slashes
        expect(normalized.includes("//")).toBe(false);

        // Normalized path should not start or end with slash
        // (unless it's empty)
        if (normalized.length > 0) {
          expect(normalized.startsWith("/")).toBe(false);
          expect(normalized.endsWith("/")).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.5: Normalized paths are idempotent
   *
   * For any path, normalizing it multiple times SHALL produce the same result
   * as normalizing it once.
   *
   * **Validates: Requirement 2.7**
   */
  it("should produce idempotent results for path normalization", () => {
    fc.assert(
      fc.property(pathWithDotsArb, (path) => {
        const normalized1 = normalizePath(path);
        const normalized2 = normalizePath(normalized1);
        const normalized3 = normalizePath(normalized2);

        // All normalizations should produce the same result
        expect(normalized1).toBe(normalized2);
        expect(normalized2).toBe(normalized3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.6: Normalized paths are in canonical form
   *
   * For any path, the normalized result SHALL be in canonical form:
   * - No ./ segments
   * - No .. segments
   * - No backslashes
   * - No consecutive slashes
   * - No leading or trailing slashes
   *
   * **Validates: Requirement 2.7**
   */
  it("should produce paths in canonical form after normalization", () => {
    fc.assert(
      fc.property(pathWithDotsArb, (path) => {
        const normalized = normalizePath(path);

        // Check canonical form properties
        expect(normalized.includes("./")).toBe(false);
        expect(normalized.includes("..")).toBe(false);
        expect(normalized.includes("\\")).toBe(false);
        expect(normalized.includes("//")).toBe(false);

        if (normalized.length > 0) {
          expect(normalized.startsWith("/")).toBe(false);
          expect(normalized.endsWith("/")).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  // ============================================================================
  // Symbol Escaping/Unescaping Tests (Requirement 2.8)
  // ============================================================================

  /**
   * Property 9.7: Escape → Unescape round-trip preserves original symbol
   *
   * For any symbol containing special characters (/, #, %), escaping and then
   * unescaping SHALL return the original symbol unchanged.
   *
   * **Validates: Requirement 2.8**
   */
  it("should preserve original symbol through escape → unescape round-trip", () => {
    fc.assert(
      fc.property(symbolWithSpecialCharsArb, (symbol) => {
        const escaped = escapeSymbol(symbol);
        const unescaped = unescapeSymbol(escaped);

        // Round-trip should preserve the original symbol
        expect(unescaped).toBe(symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.8: Symbols with forward slashes are correctly escaped and unescaped
   *
   * For any symbol containing forward slashes, the escape function SHALL
   * replace / with %2F, and unescape SHALL restore the original.
   *
   * **Validates: Requirement 2.8**
   */
  it("should correctly escape and unescape symbols with forward slashes", () => {
    fc.assert(
      fc.property(symbolWithSlashesArb, (symbol) => {
        const escaped = escapeSymbol(symbol);

        // Escaped symbol should not contain raw forward slashes
        expect(escaped.includes("/")).toBe(false);

        // Escaped symbol should contain %2F
        expect(escaped.includes("%2F")).toBe(true);

        // Round-trip should preserve original
        const unescaped = unescapeSymbol(escaped);
        expect(unescaped).toBe(symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.9: Symbols with hash characters are correctly escaped and unescaped
   *
   * For any symbol containing hash characters, the escape function SHALL
   * replace # with %23, and unescape SHALL restore the original.
   *
   * **Validates: Requirement 2.8**
   */
  it("should correctly escape and unescape symbols with hash characters", () => {
    fc.assert(
      fc.property(symbolWithHashesArb, (symbol) => {
        const escaped = escapeSymbol(symbol);

        // Escaped symbol should not contain raw hash characters
        expect(escaped.includes("#")).toBe(false);

        // Escaped symbol should contain %23
        expect(escaped.includes("%23")).toBe(true);

        // Round-trip should preserve original
        const unescaped = unescapeSymbol(escaped);
        expect(unescaped).toBe(symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.10: Symbols with percent characters are correctly escaped and unescaped
   *
   * For any symbol containing percent characters, the escape function SHALL
   * replace % with %25, and unescape SHALL restore the original.
   *
   * **Validates: Requirement 2.8**
   */
  it("should correctly escape and unescape symbols with percent characters", () => {
    fc.assert(
      fc.property(symbolWithPercentsArb, (symbol) => {
        const escaped = escapeSymbol(symbol);

        // Count original percent signs
        const originalPercentCount = (symbol.match(/%/g) || []).length;

        // Escaped symbol should have %25 for each original %
        const escapedPercentCount = (escaped.match(/%25/g) || []).length;
        expect(escapedPercentCount).toBe(originalPercentCount);

        // Round-trip should preserve original
        const unescaped = unescapeSymbol(escaped);
        expect(unescaped).toBe(symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.11: Escaping is idempotent when followed by unescaping
   *
   * For any symbol, escape(unescape(escape(symbol))) === escape(symbol)
   * This ensures the escaping process is stable.
   *
   * **Validates: Requirement 2.8**
   */
  it("should produce stable results for escape/unescape operations", () => {
    fc.assert(
      fc.property(symbolWithSpecialCharsArb, (symbol) => {
        const escaped1 = escapeSymbol(symbol);
        const unescaped = unescapeSymbol(escaped1);
        const escaped2 = escapeSymbol(unescaped);

        // Re-escaping after round-trip should produce same result
        expect(escaped1).toBe(escaped2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.12: Escaped symbols do not contain raw special characters
   *
   * For any symbol with special characters, the escaped result SHALL NOT
   * contain any raw /, #, or % characters (except as part of escape sequences).
   *
   * **Validates: Requirement 2.8**
   */
  it("should not contain raw special characters in escaped symbols", () => {
    fc.assert(
      fc.property(symbolWithSpecialCharsArb, (symbol) => {
        const escaped = escapeSymbol(symbol);

        // Remove all escape sequences to check for raw special chars
        const withoutEscapes = escaped
          .replace(/%2F/g, "")
          .replace(/%23/g, "")
          .replace(/%25/g, "");

        // Should not contain raw / or #
        expect(withoutEscapes.includes("/")).toBe(false);
        expect(withoutEscapes.includes("#")).toBe(false);

        // Any remaining % should only be part of valid escape sequences
        // (which we've already removed, so there shouldn't be any)
        // Note: This is a simplified check - the escaped string may have
        // % characters that are part of the original content that got escaped
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.13: Symbols with all three special characters are handled correctly
   *
   * For any symbol containing /, #, and % together, the escape/unescape
   * round-trip SHALL preserve the original symbol.
   *
   * **Validates: Requirement 2.8**
   */
  it("should handle symbols with all three special characters (/, #, %)", () => {
    // Generate symbols that definitely contain all three special characters
    const symbolWithAllSpecialCharsArb = fc
      .tuple(
        fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.stringOf(fc.char().filter((c) => c !== "\0" && c !== "/" && c !== "#" && c !== "%"), {
          minLength: 1,
          maxLength: 5,
        })
      )
      .map(([a, b, c, d]) => `${a}/${b}#${c}%${d}`);

    fc.assert(
      fc.property(symbolWithAllSpecialCharsArb, (symbol) => {
        // Verify the symbol contains all special characters
        expect(symbol.includes("/")).toBe(true);
        expect(symbol.includes("#")).toBe(true);
        expect(symbol.includes("%")).toBe(true);

        const escaped = escapeSymbol(symbol);

        // Escaped should contain all escape sequences
        expect(escaped.includes("%2F")).toBe(true);
        expect(escaped.includes("%23")).toBe(true);
        expect(escaped.includes("%25")).toBe(true);

        // Round-trip should preserve original
        const unescaped = unescapeSymbol(escaped);
        expect(unescaped).toBe(symbol);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.14: Path normalization in ARN generation produces canonical paths
   *
   * For any ARN components with non-canonical paths, the generated ARN
   * SHALL contain the normalized (canonical) path.
   *
   * **Validates: Requirements 2.7, 2.8**
   */
  it("should normalize paths when generating ARNs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("code", "doc", "k8s", "infra"),
        fc
          .stringOf(
            fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
            { minLength: 1, maxLength: 20 }
          )
          .filter((s) => s.trim().length > 0),
        fc
          .stringOf(
            fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
            { minLength: 1, maxLength: 20 }
          )
          .filter((s) => s.trim().length > 0),
        pathWithLeadingDotSlashArb,
        (type, workspace, pkg, path) => {
          const components = {
            type: type as "code" | "doc" | "k8s" | "infra",
            workspace,
            package: pkg,
            path,
          };

          const arn = generate(components);
          const parsed = parse(arn);

          // The parsed path should be normalized
          expect(parsed).not.toBeNull();
          expect(parsed!.path.startsWith("./")).toBe(false);
          expect(parsed!.path.includes("/./")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.15: Symbol escaping in ARN generation preserves symbols through round-trip
   *
   * For any ARN components with symbols containing special characters,
   * generating and parsing the ARN SHALL preserve the original symbol.
   *
   * **Validates: Requirements 2.7, 2.8**
   */
  it("should preserve symbols with special characters through ARN generate → parse", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("code", "doc", "k8s", "infra"),
        fc
          .stringOf(
            fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
            { minLength: 1, maxLength: 20 }
          )
          .filter((s) => s.trim().length > 0),
        fc
          .stringOf(
            fc.char().filter((c) => c !== "/" && c !== ":" && c !== "#" && c !== "\0"),
            { minLength: 1, maxLength: 20 }
          )
          .filter((s) => s.trim().length > 0),
        fc
          .array(
            fc
              .stringOf(
                fc.char().filter((c) => c !== "#" && c !== ":" && c !== "\0"),
                { minLength: 1, maxLength: 15 }
              )
              .filter((s) => s.trim().length > 0 && s !== "." && s !== ".."),
            { minLength: 1, maxLength: 3 }
          )
          .map((segments) => segments.join("/")),
        symbolWithSpecialCharsArb,
        (type, workspace, pkg, path, symbol) => {
          const normalizedPath = normalizePath(path);
          if (!normalizedPath) return; // Skip if path normalizes to empty

          const components = {
            type: type as "code" | "doc" | "k8s" | "infra",
            workspace,
            package: pkg,
            path: normalizedPath,
            symbol,
          };

          const arn = generate(components);
          const parsed = parse(arn);

          // The parsed symbol should match the original
          expect(parsed).not.toBeNull();
          expect(parsed!.symbol).toBe(symbol);
        }
      ),
      { numRuns: 100 }
    );
  });
});
