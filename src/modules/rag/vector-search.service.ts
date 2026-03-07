import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
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

  constructor(private readonly db: DatabaseService) {}

  async searchSimilar(
    queryEmbedding: number[],
    topK = 3,
    threshold = 0.7,
    method: 'cosine' | 'euclidean' = 'cosine',
  ): Promise<SearchResult[]> {
    const allVectors = await this.db.db.select().from(vectors);

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

      if (similarity >= threshold) {
        scored.push({
          id: row.id,
          documentId: row.documentId,
          chunkText: row.chunkText,
          chunkIndex: row.chunkIndex,
          similarity,
        });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  async storeVector(documentId: number, chunkText: string, chunkIndex: number, embedding: number[]): Promise<number> {
    const result = await this.db.db.insert(vectors).values({
      documentId,
      chunkText,
      chunkIndex,
      embedding: serializeVector(embedding),
    });
    return Number(result[0].insertId);
  }

  async deleteVectorsByDocument(documentId: number): Promise<void> {
    await this.db.db.delete(vectors).where(eq(vectors.documentId, documentId));
  }
}
