/**
 * Vector Store Client
 *
 * TypeScript client for Qdrant REST API and the embedding service.
 * Mirrors the Python VectorSyncAdapter's functionality.
 */
import { createHash } from "node:crypto";
import { parse as parseArn } from "./arn.js";
const COLLECTION_NAME = "archon-docs";
const CHARS_PER_TOKEN = 4;
const DEFAULT_CHUNK_SIZE = 600;
const DEFAULT_CHUNK_OVERLAP = 100;
const EMBEDDING_BATCH_SIZE = 32;
const UPSERT_BATCH_SIZE = 100;
export class VectorClient {
    qdrantUrl;
    embeddingUrl;
    constructor(qdrantUrl, embeddingServiceUrl) {
        this.qdrantUrl = qdrantUrl.replace(/\/$/, "");
        this.embeddingUrl = embeddingServiceUrl.replace(/\/$/, "");
    }
    generateChunkId(arn, chunkIndex) {
        const input = `${arn}:${chunkIndex}`;
        return createHash("sha256").update(input).digest("hex").slice(0, 32);
    }
    chunkDocument(content, source, arn, relatedArns, packageName) {
        if (!content?.trim())
            return [];
        const parsed = parseArn(arn);
        const symbolName = parsed?.symbol ?? null;
        const symbolKind = parsed?.type === "doc" ? "module" : "function";
        const targetChars = DEFAULT_CHUNK_SIZE * CHARS_PER_TOKEN;
        const overlapChars = DEFAULT_CHUNK_OVERLAP * CHARS_PER_TOKEN;
        if (content.length <= targetChars) {
            return [{
                    content, source, chunkIndex: 0, arn, relatedArns,
                    symbolName, symbolKind, package: packageName,
                }];
        }
        const chunks = [];
        let start = 0;
        let chunkIndex = 0;
        while (start < content.length) {
            let end = Math.min(start + targetChars, content.length);
            if (end < content.length) {
                const halfTarget = start + Math.floor(targetChars / 2);
                const sentenceEnd = content.lastIndexOf(". ", end);
                if (sentenceEnd > halfTarget) {
                    end = sentenceEnd + 1;
                }
                else {
                    const newlineEnd = content.lastIndexOf("\n", end);
                    if (newlineEnd > halfTarget) {
                        end = newlineEnd + 1;
                    }
                    else {
                        const spaceEnd = content.lastIndexOf(" ", end);
                        if (spaceEnd > halfTarget)
                            end = spaceEnd + 1;
                    }
                }
            }
            const chunkContent = content.slice(start, end).trim();
            if (chunkContent) {
                chunks.push({
                    content: chunkContent, source, chunkIndex, arn, relatedArns,
                    symbolName, symbolKind, package: packageName,
                });
                chunkIndex++;
            }
            if (end >= content.length)
                break;
            start = Math.max(start + 1, end - overlapChars);
        }
        return chunks;
    }
    async getEmbeddings(texts) {
        const allEmbeddings = [];
        for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
            const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
            const response = await fetch(`${this.embeddingUrl}/v1/embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: batch }),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`Embedding request failed: ${response.status}`);
            }
            const result = (await response.json());
            const sorted = result.data.sort((a, b) => a.index - b.index);
            allEmbeddings.push(...sorted.map((d) => d.embedding));
        }
        return allEmbeddings;
    }
    async ensureCollection() {
        const response = await fetch(`${this.qdrantUrl}/collections/${COLLECTION_NAME}`);
        if (response.ok) {
            await response.body?.cancel();
            return;
        }
        const createResponse = await fetch(`${this.qdrantUrl}/collections/${COLLECTION_NAME}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vectors: { size: 768, distance: "Cosine" },
                on_disk_payload: true,
            }),
        });
        if (!createResponse.ok) {
            await createResponse.body?.cancel();
            throw new Error(`Failed to create collection: ${createResponse.status}`);
        }
        await createResponse.body?.cancel();
    }
    async upsertChunks(chunks) {
        if (chunks.length === 0)
            return 0;
        await this.ensureCollection();
        const texts = chunks.map((c) => c.content);
        const embeddings = await this.getEmbeddings(texts);
        let totalUpserted = 0;
        for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
            const batchChunks = chunks.slice(i, i + UPSERT_BATCH_SIZE);
            const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH_SIZE);
            const points = batchChunks.map((chunk, j) => ({
                id: this.generateChunkId(chunk.arn, chunk.chunkIndex),
                vector: batchEmbeddings[j],
                payload: {
                    content: chunk.content,
                    source: chunk.source,
                    chunk_index: chunk.chunkIndex,
                    arn: chunk.arn,
                    related_arns: chunk.relatedArns,
                    symbol_name: chunk.symbolName,
                    symbol_kind: chunk.symbolKind,
                    package: chunk.package,
                },
            }));
            const response = await fetch(`${this.qdrantUrl}/collections/${COLLECTION_NAME}/points`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ points }),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`Qdrant upsert failed: ${response.status}`);
            }
            await response.body?.cancel();
            totalUpserted += batchChunks.length;
        }
        return totalUpserted;
    }
    async pruneStaleChunks(packageName, currentArns) {
        const countResponse = await fetch(`${this.qdrantUrl}/collections/${COLLECTION_NAME}/points/count`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filter: {
                    must: [{ key: "package", match: { value: packageName } }],
                    must_not: currentArns.length > 0
                        ? [{ key: "arn", match: { any: currentArns } }]
                        : undefined,
                },
                exact: true,
            }),
        });
        if (!countResponse.ok) {
            await countResponse.body?.cancel();
            return 0;
        }
        const countResult = (await countResponse.json());
        const staleCount = countResult.result.count;
        if (staleCount === 0)
            return 0;
        const filter = {
            must: [{ key: "package", match: { value: packageName } }],
            ...(currentArns.length > 0
                ? { must_not: [{ key: "arn", match: { any: currentArns } }] }
                : {}),
        };
        const deleteResponse = await fetch(`${this.qdrantUrl}/collections/${COLLECTION_NAME}/points/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filter }),
        });
        await deleteResponse.body?.cancel();
        return staleCount;
    }
}
//# sourceMappingURL=vector_client.js.map