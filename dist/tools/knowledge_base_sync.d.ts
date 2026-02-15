/**
 * Knowledge Base Sync Tool
 *
 * MCP tool that syncs SCIP indexes and Archon documentation to the
 * Knowledge Base Code Graph (via GraphQL) and Vector Store (via Qdrant).
 *
 * Service endpoints are read from environment variables:
 *   GRAPH_URL     - Code graph service (e.g., http://kb-name-graph:8081)
 *   QDRANT_URL    - Qdrant vector store (e.g., http://kb-name-qdrant:6334)
 *   EMBEDDING_URL - Embedding service (e.g., http://kb-name-embedding-svc:8000)
 */
import type { SyncToKnowledgeBaseInput, SyncToKnowledgeBaseOutput } from "../types/tools.js";
export declare function syncToKnowledgeBase(input: SyncToKnowledgeBaseInput): Promise<SyncToKnowledgeBaseOutput>;
//# sourceMappingURL=knowledge_base_sync.d.ts.map