/**
 * Graph Service Client
 *
 * TypeScript client for the Code Graph GraphQL API.
 * Mirrors the Python GraphSyncAdapter's functionality.
 */
import type { ScipSymbol, ScipRelationship } from "../types/scip.js";
export interface GraphSyncResult {
    nodesCreated: number;
    nodesUpdated: number;
    edgesCreated: number;
    edgesRemoved: number;
}
export declare class GraphClient {
    private readonly graphqlUrl;
    constructor(graphServiceUrl: string);
    private executeGraphQL;
    private transformSymbol;
    private transformRelationship;
    syncFromScip(packagePath: string, workspace: string, packageName: string, symbols: ScipSymbol[], relationships: ScipRelationship[], indexHash: string): Promise<GraphSyncResult>;
    prunePackage(packageName: string, keepArns: string[]): Promise<number>;
}
//# sourceMappingURL=graph_client.d.ts.map