/**
 * Vector Store Client
 *
 * TypeScript client for Qdrant REST API and the embedding service.
 * Mirrors the Python VectorSyncAdapter's functionality.
 */
export interface DocChunk {
    content: string;
    source: string;
    chunkIndex: number;
    arn: string;
    relatedArns: string[];
    symbolName: string | null;
    symbolKind: string | null;
    package: string;
}
export interface VectorSyncResult {
    chunksUpserted: number;
    chunksPruned: number;
    errors: string[];
}
export declare class VectorClient {
    private readonly qdrantUrl;
    private readonly embeddingUrl;
    constructor(qdrantUrl: string, embeddingServiceUrl: string);
    private generateChunkId;
    chunkDocument(content: string, source: string, arn: string, relatedArns: string[], packageName: string): DocChunk[];
    private getEmbeddings;
    private ensureCollection;
    upsertChunks(chunks: DocChunk[]): Promise<number>;
    pruneStaleChunks(packageName: string, currentArns: string[]): Promise<number>;
}
//# sourceMappingURL=vector_client.d.ts.map