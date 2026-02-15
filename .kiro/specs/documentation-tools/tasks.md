# Implementation Plan: Documentation Tools MCP Package

## Overview

This task list implements the MCP tools for SCIP indexing and Archon documentation generation as specified in the requirements and design documents. Tasks are organized by component with property-based tests following each implementation.

**Testing Framework:** fast-check (TypeScript)
**Minimum PBT Iterations:** 100 per property test

## Tasks

- [x] 1. Core Library: ARN Generation (`src/lib/arn.ts`)
  - [x] 1.1 Implement ARN type definitions
    - Create `src/types/arn.ts` with `ArnType`, `ArnComponents`, `ArnValidationResult` types
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 1.2 Implement ARN generation function
    - Implement `generate(components: ArnComponents): string`
    - Format: `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
    - Ensure deterministic output for identical inputs
    - _Requirements: 2.2, 2.4_
  
  - [x] 1.3 Implement ARN parsing function
    - Implement `parse(arn: string): ArnComponents | null`
    - Extract type, workspace, package, path, and symbol components
    - Return null for invalid ARN format
    - _Requirements: 2.5_
  
  - [x] 1.4 Implement ARN validation function
    - Implement `validate(arn: string): ArnValidationResult`
    - Check for missing required components
    - Validate type values (code, doc, k8s, infra)
    - Return descriptive error messages
    - _Requirements: 2.6_
  
  - [x] 1.5 Implement path normalization
    - Implement `normalizePath(path: string): string`
    - Remove leading `./`
    - Resolve `..` segments
    - Normalize path separators
    - _Requirements: 2.7_
  
  - [x] 1.6 Implement symbol escaping/unescaping
    - Implement `escapeSymbol(symbol: string): string`
    - Implement `unescapeSymbol(escaped: string): string`
    - Escape: `/` → `%2F`, `#` → `%23`, `%` → `%25`
    - _Requirements: 2.8_

  - [x] 1.7 Unit tests for ARN library
    - Test edge cases: empty strings, very long paths, unicode symbols
    - Test error cases: null inputs, missing components
    - Create `tests/unit/lib/arn.test.ts`
    - _Requirements: 2.1-2.8_

  - [x] 1.8 [PBT] Property 6: ARN Format Compliance
    - Create `tests/property/arn.property.test.ts`
    - Generate random valid ARN components
    - Verify generated ARN matches format `arn:archon:<type>:<workspace>/<package>/<path>#<symbol>`
    - Verify only valid type values are accepted
    - **Validates: Requirements 2.2, 2.3**
  
  - [x] 1.9 [PBT] Property 7: ARN Round-Trip Consistency
    - For any valid ARN components, generate → parse returns original components
    - Verify determinism: same inputs always produce same ARN
    - **Validates: Requirements 2.4, 2.5**
  
  - [x] 1.10 [PBT] Property 8: ARN Validation
    - Generate malformed ARN strings (missing components, invalid format, unknown type)
    - Verify validation returns error with descriptive message
    - **Validates: Requirement 2.6**
  
  - [x] 1.11 [PBT] Property 9: ARN Component Normalization
    - Generate paths with `./` and `..` segments
    - Verify normalization produces canonical form
    - Generate symbols with special characters (`/`, `#`, `%`)
    - Verify escape → unescape round-trip preserves original
    - **Validates: Requirements 2.7, 2.8**

- [x] 2. Core Library: Language Detector (`src/lib/language_detector.ts`)
  - [x] 2.1 Implement language detector types
    - Create `LanguageDetectionResult` interface in `src/types/tools.ts`
    - Include `hasGo`, `hasTypeScript`, `goRoot`, `tsRoot` fields
    - _Requirements: 1.3, 1.4_
  
  - [x] 2.2 Implement language detection function
    - Implement `detect(packagePath: string): Promise<LanguageDetectionResult>`
    - Check for `go.mod` or `.go` files for Go detection
    - Check for `package.json` or `.js`/`.ts` files for TypeScript detection
    - Return paths to detected language roots
    - _Requirements: 1.3, 1.4_

  - [x] 2.3 Unit tests for language detector
    - Test edge cases: empty directories, deeply nested files
    - Test mixed cases: Go and TypeScript in same directory
    - Create `tests/unit/lib/language_detector.test.ts`
    - _Requirements: 1.3, 1.4_

  - [x] 2.4 [PBT] Property 1: Language Detection Accuracy
    - Create `tests/property/language_detector.property.test.ts`
    - Generate random directory structures with Go/TypeScript markers
    - Verify detector correctly identifies presence of each language
    - Verify detection works regardless of directory depth or file count
    - **Validates: Requirements 1.3, 1.4**

- [x] 3. Core Library: SCIP Parser (`src/lib/scip_parser.ts`)
  - [x] 3.1 Implement SCIP parser types
    - Create `src/types/scip.ts` with `SymbolKind`, `RelationshipType`, `SymbolLocation`, `ScipSymbol`, `ScipRelationship`, `ScipParseResult`, `ScipParseError` types
    - _Requirements: 3.1, 3.2_
  
  - [x] 3.2 Implement SCIP index parsing
    - Implement `parse(indexPath, workspace, packageName): Promise<ScipParseResult>`
    - Extract symbol names, kinds, signatures, documentation, locations
    - Map SCIP symbols to ARNs using ARN library
    - Compute SHA-256 hash for change detection
    - _Requirements: 3.2, 3.3, 3.4_
  
  - [x] 3.3 Implement relationship extraction
    - Extract `contains` (parent-child) relationships
    - Extract `references` (symbol usage) relationships
    - Extract `implements` (interface implementation) relationships
    - Extract `extends` (inheritance) relationships
    - Extract `imports` (module import) relationships
    - _Requirements: 3.5_
  
  - [x] 3.4 Implement hash-based change detection
    - Implement `hasChanged(indexPath, storedHash): Promise<boolean>`
    - Compare computed hash with stored hash
    - _Requirements: 3.6_
  
  - [x] 3.5 Implement incremental parsing
    - Implement `parseIncremental(indexPath, workspace, packageName, previousResult): Promise<ScipParseResult>`
    - Track which files have changed since last parse
    - Only process changed files
    - Preserve previously parsed data for unchanged files
    - _Requirements: 3.6_
  
  - [x] 3.6 Implement error handling for malformed indexes
    - Return structured error with diagnostic information
    - Continue parsing valid portions where possible
    - Never crash or produce invalid output
    - _Requirements: 3.7_

  - [x] 3.7 Unit tests for SCIP parser
    - Test edge cases: empty index, single symbol, large index
    - Test error cases: corrupted files, missing fields
    - Create `tests/unit/lib/scip_parser.test.ts`
    - Create test fixtures in `tests/fixtures/scip/`
    - _Requirements: 3.1-3.7_

  - [x] 3.8 [PBT] Property 10: SCIP Parsing Completeness
    - Create `tests/property/scip_parser.property.test.ts`
    - Generate valid SCIP index content with symbols and relationships
    - Verify parser extracts all symbols with name, kind, signature, documentation, location
    - Verify valid ARNs are assigned to each symbol
    - Verify all relationship types are extracted
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
  
  - [x] 3.9 [PBT] Property 11: Incremental Parsing Efficiency
    - Generate SCIP indexes with subset of changed files
    - Verify incremental parsing only processes changed files
    - Verify previously parsed data is preserved for unchanged files
    - **Validates: Requirement 3.6**
  
  - [x] 3.10 [PBT] Property 12: Malformed SCIP Handling
    - Generate malformed or corrupted SCIP index content
    - Verify parser returns graceful error with diagnostic information
    - Verify parser does not crash or produce invalid output
    - **Validates: Requirement 3.7**

- [x] 4. Core Library: Documentation Generator (`src/lib/doc_generator.ts`)
  - [x] 4.1 Implement documentation generator types
    - Add `DocTemplate`, `GeneratedDoc`, `ManualSection` types to `src/types/tools.ts`
    - _Requirements: 4.2, 4.7_
  
  - [x] 4.2 Implement symbol documentation generation
    - Implement `generateForSymbol(symbol, relationships): GeneratedDoc`
    - Generate plain English summaries from SCIP symbol information
    - Include ARN references to related symbols
    - _Requirements: 4.3, 4.4_
  
  - [x] 4.3 Implement file documentation generation
    - Implement `generateForFile(filePath, symbols, relationships): GeneratedDoc`
    - Create `<name>.archon.md` co-located with source
    - Include purpose description, public API, parameters, return values
    - _Requirements: 4.2, 4.3_
  
  - [x] 4.4 Implement documentation templates
    - Create templates for function, class, method, module symbol kinds
    - Apply appropriate template based on symbol kind
    - _Requirements: 4.7_
  
  - [x] 4.5 Implement manual section preservation
    - Implement `preserveManualSections(existingDoc, newDoc): string`
    - Detect `<!-- archon:manual -->` and `<!-- /archon:manual -->` markers
    - Preserve content within markers during regeneration
    - _Requirements: 4.5_
  
  - [x] 4.6 Implement change detection for documentation
    - Implement `needsRegeneration(docPath, indexHash): Promise<boolean>`
    - Compare stored index hash with current hash
    - Skip regeneration if unchanged
    - _Requirements: 4.6_
  
  - [x] 4.7 Implement orphaned documentation marking
    - Implement `markOrphaned(docPath): Promise<void>`
    - Add `<!-- archon:orphaned -->` marker when source is deleted
    - _Requirements: 4.9_

  - [x] 4.8 Unit tests for documentation generator
    - Test edge cases: no symbols, many symbols, nested directories
    - Test template variations: function, class, module
    - Create `tests/unit/lib/doc_generator.test.ts`
    - Create test fixtures in `tests/fixtures/docs/`
    - _Requirements: 4.2-4.9_

  - [x] 4.9 [PBT] Property 13: Documentation Co-location
    - Create `tests/property/doc_generator.property.test.ts`
    - Generate random source file paths `<dir>/<name>.<ext>`
    - Verify documentation is written to `<dir>/<name>.archon.md`
    - **Validates: Requirement 4.2**
  
  - [x] 4.10 [PBT] Property 14: Documentation Content Completeness
    - Generate symbols with various kinds and relationships
    - Verify generated documentation includes symbol information from SCIP
    - Verify documentation contains valid ARN references to related symbols
    - **Validates: Requirements 4.3, 4.4**
  
  - [x] 4.11 [PBT] Property 15: Manual Section Preservation
    - Generate existing documentation with `<!-- archon:manual -->` sections
    - Regenerate documentation with new content
    - Verify manual section content is preserved unchanged
    - **Validates: Requirement 4.5**
  
  - [x] 4.12 [PBT] Property 16: Documentation Change Detection
    - Generate packages with unchanged SCIP index hashes
    - Verify documentation tool skips regeneration
    - Verify files are reported as skipped
    - **Validates: Requirement 4.6**

- [x] 5. MCP Tool: SCIP Indexing (`src/tools/scip_indexing.ts`)
  - [x] 5.1 Implement SCIP indexing tool types
    - Add `GenerateScipIndexInput`, `GenerateScipIndexOutput` to `src/types/tools.ts`
    - _Requirements: 1.1, 1.11_
  
  - [x] 5.2 Implement SCIP indexing tool
    - Register tool as `generate_scip_index` with MCP server
    - Accept `packagePath` and optional `force` parameters
    - Use language detector to identify Go/TypeScript
    - Invoke scip-go for Go packages
    - Invoke scip-typescript for TypeScript packages
    - _Requirements: 1.1, 1.2, 1.5, 1.6_
  
  - [x] 5.3 Implement multi-language handling
    - Generate separate indexes for packages with both Go and TypeScript
    - Output to `<package>/.archon/scip/` with consistent naming
    - Use `index.scip` for single-language, `index.go.scip`/`index.ts.scip` for multi-language
    - _Requirements: 1.7, 1.8_
  
  - [x] 5.4 Implement index hash computation and storage
    - Compute SHA-256 hash of each SCIP index
    - Store hash in `<package>/.archon/scip/metadata.json`
    - _Requirements: 1.9_
  
  - [x] 5.5 Implement error handling for missing SCIP tools
    - Detect if scip-go or scip-typescript is not installed
    - Return error with installation instructions
    - _Requirements: 1.10_
  
  - [x] 5.6 Implement tool response
    - Return success, packagePath, languagesDetected, indexes array, errors array
    - Include language, indexPath, symbolCount, hash for each index
    - _Requirements: 1.11_

  - [x] 5.7 Unit tests for SCIP indexing tool
    - Test tool response structure validation
    - Test error response format validation
    - Create `tests/unit/tools/scip_indexing.test.ts`
    - _Requirements: 1.1-1.11_

  - [x] 5.8 [PBT] Property 2: Correct SCIP Tool Invocation
    - Generate packages with detected languages
    - Verify scip-go is invoked for Go packages
    - Verify scip-typescript is invoked for TypeScript packages
    - Verify tool selection is deterministic based on detected language
    - **Validates: Requirements 1.5, 1.6**
  
  - [x] 5.9 [PBT] Property 3: Multi-Language Package Handling
    - Generate packages containing both Go and TypeScript code
    - Verify separate indexes are generated for each language
    - Verify both indexes are present in output
    - **Validates: Requirement 1.7**
  
  - [x] 5.10 [PBT] Property 4: Index Output Location Consistency
    - Generate successfully indexed packages
    - Verify SCIP index files are written to `<package>/.archon/scip/`
    - Verify consistent naming conventions
    - **Validates: Requirement 1.8**
  
  - [x] 5.11 [PBT] Property 5: Index Hash Determinism
    - Generate SCIP index content
    - Compute hash multiple times
    - Verify identical hash values
    - Verify identical content across runs produces identical hashes
    - **Validates: Requirement 1.9**

- [x] 6. MCP Tool: Documentation Generation (`src/tools/doc_generation.ts`)
  - [x] 6.1 Implement documentation generation tool types
    - Add `GenerateArchonDocInput`, `GenerateArchonDocOutput` to `src/types/tools.ts`
    - _Requirements: 4.1, 4.8_
  
  - [x] 6.2 Implement documentation generation tool
    - Register tool as `generate_archon_doc` with MCP server
    - Accept `packagePath`, optional `files`, optional `force` parameters
    - Use SCIP parser to extract symbol information
    - Use documentation generator to create `.archon.md` files
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 6.3 Implement ARN reference generation
    - Include ARN references to related symbols in documentation
    - Format: `[SymbolName](arn:archon:code:workspace/package/path#symbol)`
    - _Requirements: 4.4_
  
  - [x] 6.4 Implement change detection and skipping
    - Check SCIP index hash before regeneration
    - Skip unchanged files and report as skipped
    - _Requirements: 4.6_
  
  - [x] 6.5 Implement tool response
    - Return success, packagePath, filesGenerated array, filesSkipped array, errors array
    - Include sourcePath, docPath, ARN for each generated file
    - _Requirements: 4.8_

  - [x] 6.6 Unit tests for documentation generation tool
    - Test tool response structure validation
    - Test error response format validation
    - Create `tests/unit/tools/doc_generation.test.ts`
    - _Requirements: 4.1-4.9_

- [x] 7. MCP Tool: ARN Resolution (`src/tools/arn_resolution.ts`)
  - [x] 7.1 Implement ARN resolution tool types
    - Add `ResolveArnInput`, `ResolveArnOutput` to `src/types/tools.ts`
    - _Requirements: 5.1, 5.3_
  
  - [x] 7.2 Implement ARN resolution tool
    - Register tool as `resolve_arn` with MCP server
    - Accept `arn` parameter
    - Use ARN library to parse and validate ARN
    - _Requirements: 5.1, 5.2_
  
  - [x] 7.3 Implement code ARN resolution
    - Resolve `code` ARNs to source files
    - Return file path and line number
    - _Requirements: 5.3, 5.5_
  
  - [x] 7.4 Implement doc ARN resolution
    - Resolve `doc` ARNs to `.archon.md` files
    - Return file path
    - _Requirements: 5.5_
  
  - [x] 7.5 Implement error handling
    - Return descriptive error for invalid ARN format
    - Return descriptive error for non-existent file
    - Return descriptive error for non-existent symbol
    - _Requirements: 5.4_

  - [x] 7.6 Unit tests for ARN resolution tool
    - Test tool response structure validation
    - Test error response format validation
    - Create `tests/unit/tools/arn_resolution.test.ts`
    - _Requirements: 5.1-5.5_

  - [x] 7.7 [PBT] Property 17: ARN Resolution Correctness
    - Generate valid ARNs pointing to existing resources
    - Verify resolution returns correct file path, line number, symbol information
    - Generate ARNs pointing to non-existent resources
    - Verify resolution returns appropriate error
    - Verify both code and doc ARN types are resolvable
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [x] 8. MCP Tool: Workspace Indexing (`src/tools/workspace_indexing.ts`)
  - [x] 8.1 Implement workspace indexing tool types
    - Add `IndexWorkspaceInput`, `IndexWorkspaceOutput` to `src/types/tools.ts`
    - _Requirements: 6.1, 6.6_
  
  - [x] 8.2 Implement workspace indexing tool
    - Register tool as `index_workspace` with MCP server
    - Accept `workspacePath`, optional `packages`, optional `force` parameters
    - _Requirements: 6.1, 6.2, 6.7, 6.8_
  
  - [x] 8.3 Implement package discovery
    - Discover all packages by detecting `go.mod` and `package.json`
    - Support arbitrary nesting depth
    - _Requirements: 6.3_
  
  - [x] 8.4 Implement dependency order processing
    - Analyze inter-package dependencies
    - Process packages in dependency order (dependencies before dependents)
    - _Requirements: 6.4_
  
  - [x] 8.5 Implement change tracking
    - Track which packages have changed using stored index hashes
    - Skip unchanged packages unless `force=true`
    - _Requirements: 6.5, 6.7_
  
  - [x] 8.6 Implement tool response
    - Return success, workspacePath, packagesIndexed array, packagesSkipped array, totalSymbols, errors array
    - Include package name, languages, symbolCount for each indexed package
    - _Requirements: 6.6_

  - [x] 8.7 Unit tests for workspace indexing tool
    - Test tool response structure validation
    - Test error response format validation
    - Test timeout handling
    - Create `tests/unit/tools/workspace_indexing.test.ts`
    - _Requirements: 6.1-6.8_

  - [x] 8.8 [PBT] Property 18: Workspace Package Discovery
    - Generate workspace directory structures with packages at various depths
    - Verify all packages (directories with `go.mod`, `package.json`) are discovered
    - Verify discovery works regardless of nesting depth
    - **Validates: Requirement 6.3**
  
  - [x] 8.9 [PBT] Property 19: Dependency Order Processing
    - Generate workspaces with inter-package dependencies
    - Verify packages are processed in dependency order
    - Verify dependencies are processed before dependents
    - **Validates: Requirement 6.4**
  
  - [x] 8.10 [PBT] Property 20: Force Parameter Behavior
    - Generate workspaces with unchanged packages
    - Verify `force=true` causes all packages to be re-indexed
    - Verify `packages` parameter limits processing to specified packages
    - **Validates: Requirements 6.7, 7.6**

- [x] 9. MCP Tool: Workspace Documentation (`src/tools/workspace_docs.ts`)
  - [x] 9.1 Implement workspace documentation tool types
    - Add `DocumentWorkspaceInput`, `DocumentWorkspaceOutput` to `src/types/tools.ts`
    - _Requirements: 7.1, 7.5_
  
  - [x] 9.2 Implement workspace documentation tool
    - Register tool as `document_workspace` with MCP server
    - Accept `workspacePath`, optional `packages`, optional `force` parameters
    - _Requirements: 7.1, 7.2, 7.6, 7.7_
  
  - [x] 9.3 Implement change-based documentation
    - Only generate documentation for packages with changed SCIP indexes
    - Use hash comparison for change detection
    - _Requirements: 7.3_
  
  - [x] 9.4 Implement ARN generation tracking
    - Track all ARNs created during documentation generation
    - Include in response
    - _Requirements: 7.4_
  
  - [x] 9.5 Implement tool response
    - Return success, workspacePath, packagesDocumented array, packagesSkipped array, totalFilesGenerated, totalArns, errors array
    - Include package name, filesGenerated count, arnsCreated array for each documented package
    - _Requirements: 7.5_

  - [x] 9.6 Unit tests for workspace documentation tool
    - Test tool response structure validation
    - Test error response format validation
    - Create `tests/unit/tools/workspace_docs.test.ts`
    - _Requirements: 7.1-7.7_

- [ ] 10. MCP Tool: Sync to Knowledge Base (`src/tools/sync_to_knowledge_base.ts`)
  - [ ] 10.1 Implement sync tool types
    - Add `SyncToKnowledgeBaseInput`, `SyncToKnowledgeBaseOutput` to `src/types/tools.ts`
    - Add `PackageSyncResult` type for per-package sync results
    - _Requirements: 8.1, 8.7_
  
  - [ ] 10.2 Implement HTTP client for sync service API
    - Create `src/lib/sync_client.ts` for calling sync service
    - Implement `SyncServiceClient` class with `syncWorkspace` method
    - Configure base URL for sync service API (http://archon-sync-service.archon.svc.cluster.local/sync)
    - Handle connection errors with descriptive messages and retry guidance
    - _Requirements: 8.5, 8.8_
  
  - [ ] 10.3 Implement sync to knowledge base tool
    - Register tool as `sync_to_knowledge_base` with MCP server
    - Accept `workspacePath`, optional `packages`, optional `force` parameters
    - Call sync service API via HTTP client
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 10.4 Implement sync mode handling
    - Support full sync mode (all packages) when no `packages` parameter provided
    - Support incremental sync mode (only changed packages) based on change detection
    - Respect `force` parameter to bypass change detection
    - _Requirements: 8.4, 8.6_
  
  - [ ] 10.5 Implement tool response
    - Return success, packagesSynced array, packagesSkipped array, errors array
    - Include package name, graphNodesCreated, graphEdgesCreated, vectorChunksUpserted for each synced package
    - Report sync status for both Code Graph and Vector Store
    - _Requirements: 8.7, 8.9_
  
  - [ ] 10.6 Implement error handling
    - Handle sync service unavailability with descriptive error and retry guidance
    - Handle partial sync failures (some packages succeed, some fail)
    - Return structured error responses
    - _Requirements: 8.8_

  - [ ] 10.7 Unit tests for sync to knowledge base tool
    - Test tool response structure validation
    - Test error response format validation
    - Test HTTP client error handling
    - Create `tests/unit/tools/sync_to_knowledge_base.test.ts`
    - _Requirements: 8.1-8.9_

- [x] 11. MCP Server Integration (`src/server.ts`)
  - [x] 11.1 Implement MCP server setup
    - Configure MCP server with `@modelcontextprotocol/sdk`
    - Register all 6 tools with the server
    - _Requirements: 1.1, 4.1, 5.1, 6.1, 7.1, 8.1_
  
  - [x] 11.2 Implement tool registration
    - Register `generate_scip_index` tool
    - Register `generate_archon_doc` tool
    - Register `resolve_arn` tool
    - Register `index_workspace` tool
    - Register `document_workspace` tool
    - _Requirements: 1.1, 4.1, 5.1, 6.1, 7.1_
  
  - [ ] 11.3 Register sync_to_knowledge_base tool
    - Register `sync_to_knowledge_base` tool with MCP server
    - _Requirements: 8.1_
  
  - [x] 11.4 Implement error handling middleware
    - Handle tool execution errors gracefully
    - Return structured error responses
    - _Requirements: 1.10, 5.4_

  - [x] 11.5 Integration tests for MCP server
    - Test server startup and tool registration
    - Test tool invocation through MCP protocol
    - Test error handling
    - Create `tests/integration/server.test.ts`
    - _Requirements: 1.1, 4.1, 5.1, 6.1, 7.1, 8.1_

- [x] 12. Test Fixtures and Utilities
  - [x] 12.1 Create SCIP index test fixtures
    - Create sample SCIP index files in `tests/fixtures/scip/`
    - Include valid indexes, malformed indexes, empty indexes
    - _Requirements: 3.1-3.7_
  
  - [x] 12.2 Create package structure test fixtures
    - Create sample package structures in `tests/fixtures/packages/`
    - Include Go-only, TypeScript-only, and multi-language packages
    - _Requirements: 1.3, 1.4, 1.7_
  
  - [x] 12.3 Create documentation test fixtures
    - Create sample documentation files in `tests/fixtures/docs/`
    - Include files with manual sections, orphaned markers
    - _Requirements: 4.5, 4.9_
  
  - [x] 12.4 Create test utilities
    - Create generators for property-based tests
    - Create helper functions for test setup/teardown
    - _Requirements: All_

## Notes

- All property-based tests use fast-check with minimum 100 iterations
- Property tests are tagged with format: `Feature: documentation-tools, Property N: <property_text>`
- Unit tests should be created alongside implementations
- Integration tests verify end-to-end MCP tool functionality
- Test fixtures provide realistic test data for both unit and property tests

## Dependencies

Tasks should be executed in order, as later tasks depend on earlier implementations:
1. Core libraries (Tasks 1-4) must be completed before MCP tools (Tasks 5-10)
2. ARN library (Task 1) is required by SCIP parser (Task 3) and documentation generator (Task 4)
3. Language detector (Task 2) is required by SCIP indexing tool (Task 5)
4. SCIP parser (Task 3) is required by documentation generation tool (Task 6)
5. Documentation generator (Task 4) is required by documentation generation tool (Task 6)
6. All tools (Tasks 5-10) must be completed before MCP server integration (Task 11)
7. Sync to knowledge base tool (Task 10) requires the sync service API in ArchonKnowledgeBaseInfrastructure to be available

**Source**
- `AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/requirements.md` - Requirements specification
- `AphexKnowledgeBaseMCPTools/.kiro/specs/documentation-tools/design.md` - Design specification
- `.kiro/specs/archon-agent-pipeline/tasks.md` - Parent specification tasks
