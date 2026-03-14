import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { vectors } from '../database/schema/vectors.schema';
import { serializeVector, unserializeVector, cosineSimilarity, euclideanDistance } from '../../common/helpers/vector-math';

export interface SearchResult {
  id: number;
  documentId: number;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private readonly vectorSearchLimit: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    this.vectorSearchLimit = this.config.get<number>('rag.vectorSearchLimit', 500);
  }

  // Temporary row limit to prevent OOM until native vector search (pgvector / MySQL 9) is available.
  async searchSimilar(
    queryEmbedding: number[],
    topK = 3,
    threshold = 0.7,
    method: 'cosine' | 'euclidean' = 'cosine',
    embeddingModel?: string,
  ): Promise<SearchResult[]> {
    const dims = queryEmbedding.length;
    const conditions = [eq(vectors.embeddingDimensions, dims)];
    if (embeddingModel) conditions.push(eq(vectors.embeddingModel, embeddingModel));

    const allVectors = await this.db.db
      .select()
      .from(vectors)
      .where(and(...conditions))
      .limit(this.vectorSearchLimit);

    if (allVectors.length >= this.vectorSearchLimit) {
      this.logger.warn(
        `Vector search hit the ${this.vectorSearchLimit}-row limit. Results may be truncated — consider increasing VECTOR_SEARCH_LIMIT or migrating to native vector search.`,
      );
    }

    const scored: SearchResult[] = [];
    for (const row of allVectors) {
      const stored = unserializeVector(row.embedding);

      let similarity: number;

      if (method === 'cosine') {
        similarity = cosineSimilarity(queryEmbedding, stored);
      } else {
        const dist = euclideanDistance(queryEmbedding, stored);
        similarity = 1 / (1 + dist);
      }

      scored.push({
        id: row.id,
        documentId: row.documentId,
        chunkText: row.chunkText,
        chunkIndex: row.chunkIndex,
        similarity,
      });
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    const aboveThreshold = scored.filter((r) => r.similarity >= threshold).slice(0, topK);
    if (aboveThreshold.length > 0) return aboveThreshold;

    return scored.slice(0, Math.min(topK, scored.length));
  }

  async storeVector(
    documentId: number,
    chunkText: string,
    chunkIndex: number,
    embedding: number[],
    embeddingModel?: string,
    embeddingDimensions?: number,
  ): Promise<number> {
    const result = await this.db.db.insert(vectors).values({
      documentId,
      chunkText,
      chunkIndex,
      embedding: serializeVector(embedding),
      ...(embeddingModel ? { embeddingModel } : {}),
      ...(embeddingDimensions ? { embeddingDimensions } : {}),
    });
    return Number(result[0].insertId);
  }

  async deleteVectorsByDocument(documentId: number): Promise<void> {
    await this.db.db.delete(vectors).where(eq(vectors.documentId, documentId));
  }

  async deleteVectorsByModel(embeddingModel: string): Promise<void> {
    await this.db.db.delete(vectors).where(eq(vectors.embeddingModel, embeddingModel));
  }
}
