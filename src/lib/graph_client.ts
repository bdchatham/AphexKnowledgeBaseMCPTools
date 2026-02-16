/**
 * Graph Service Client
 *
 * TypeScript client for the Code Graph GraphQL API.
 * Mirrors the Python GraphSyncAdapter's functionality.
 */

import type { ScipSymbol, ScipRelationship } from "../types/scip.js";

const SCIP_KIND_TO_GRAPHQL: Record<string, string> = {
  function: "FUNCTION",
  class: "CLASS",
  method: "METHOD",
  variable: "VARIABLE",
  type: "TYPE",
  module: "MODULE",
};

const SCIP_TYPE_TO_GRAPHQL: Record<string, string> = {
  contains: "CONTAINS",
  references: "REFERENCES",
  implements: "IMPLEMENTS",
  extends: "EXTENDS",
  imports: "IMPORTS",
};

export interface GraphSyncResult {
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesRemoved: number;
}

export class GraphClient {
  private readonly graphqlUrl: string;

  constructor(graphServiceUrl: string) {
    this.graphqlUrl = `${graphServiceUrl.replace(/\/$/, "")}/graphql`;
  }

  private async executeGraphQL(
    query: string,
    variables: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    };

    if (result.errors?.length) {
      const messages = result.errors.map((e) => e.message).join("; ");
      throw new Error(`GraphQL errors: ${messages}`);
    }

    return result.data ?? {};
  }

  private transformSymbol(
    symbol: ScipSymbol,
    workspace: string,
    packageName: string
  ): Record<string, unknown> {
    return {
      arn: symbol.arn,
      type: "CODE",
      workspace,
      package: packageName,
      path: symbol.location.file,
      symbol: symbol.name,
      kind: SCIP_KIND_TO_GRAPHQL[symbol.kind] ?? "VARIABLE",
      name: symbol.name,
      signature: symbol.signature ?? null,
      documentation: symbol.documentation ?? null,
      filePath: symbol.location.file,
      lineNumber: symbol.location.line,
    };
  }

  private transformRelationship(
    rel: ScipRelationship
  ): Record<string, unknown> {
    return {
      fromArn: rel.from,
      toArn: rel.to,
      type: SCIP_TYPE_TO_GRAPHQL[rel.type] ?? "REFERENCES",
    };
  }

  async syncFromScip(
    packagePath: string,
    workspace: string,
    packageName: string,
    symbols: ScipSymbol[],
    relationships: ScipRelationship[],
    indexHash: string
  ): Promise<GraphSyncResult> {
    const symbolInputs = symbols.map((s) =>
      this.transformSymbol(s, workspace, packageName)
    );
    const relationshipInputs = relationships.map((r) =>
      this.transformRelationship(r)
    );

    const data = await this.executeGraphQL(
      `mutation SyncFromScip(
        $packagePath: String!
        $symbols: [SymbolInput!]!
        $relationships: [RelationshipInput!]!
        $indexHash: String!
      ) {
        syncFromScip(
          packagePath: $packagePath
          symbols: $symbols
          relationships: $relationships
          indexHash: $indexHash
        ) { nodesCreated nodesUpdated edgesCreated edgesRemoved }
      }`,
      { packagePath, symbols: symbolInputs, relationships: relationshipInputs, indexHash }
    );

    const result = data["syncFromScip"] as GraphSyncResult;
    return result;
  }

  async prunePackage(packageName: string, keepArns: string[]): Promise<number> {
    const data = await this.executeGraphQL(
      `mutation PrunePackage($package: String!, $keepArns: [ID!]!) {
        prunePackage(package: $package, keepArns: $keepArns)
      }`,
      { package: packageName, keepArns }
    );

    return data["prunePackage"] as number;
  }
}
