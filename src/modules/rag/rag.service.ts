import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { OpenAIService } from '../openai/openai.service';
import { VectorSearchService } from './vector-search.service';
import { queryEmbeddingCache } from '../database/schema/query-embedding-cache.schema';
import { chunkText } from '../../common/helpers/text-processor';
import { serializeVector, unserializeVector } from '../../common/helpers/vector-math';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly openai: OpenAIService,
    private readonly vectorSearch: VectorSearchService,
    private readonly config: ConfigService,
  ) {}

  async generateResponse(
    message: string,
    systemPrompt: string | null = null,
    conversationHistory: Array<{ sender: string; message_text: string }> = [],
  ): Promise<{ response: string; context: string; similarity: number }> {
    const topK = this.config.get<number>('rag.topK') ?? 3;
    const threshold = this.config.get<number>('rag.similarityThreshold') ?? 0.7;
    const method = (this.config.get<string>('rag.similarityMethod') ?? 'cosine') as 'cosine' | 'euclidean';

    const embedding = await this.getCachedOrCreateEmbedding(message);
    const results = await this.vectorSearch.searchSimilar(embedding, topK, threshold, method);

    let context = '';
    let bestSimilarity = 0;

    if (results.length > 0) {
      context = results.map((r) => r.chunkText).join('\n\n---\n\n');
      bestSimilarity = results[0].similarity;
    }

    const response = await this.openai.generateResponse(
      message,
      context,
      systemPrompt,
      undefined,
      undefined,
      conversationHistory,
    );

    return { response, context, similarity: bestSimilarity };
  }

  async indexDocument(documentId: number, contentText: string): Promise<number> {
    const chunkSize = this.config.get<number>('rag.chunkSize') ?? 500;
    const overlap = this.config.get<number>('rag.chunkOverlap') ?? 50;

    const chunks = chunkText(contentText, chunkSize, overlap);
    let indexed = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await this.openai.createEmbedding(chunks[i]);
        await this.vectorSearch.storeVector(documentId, chunks[i], i, embedding);
        indexed++;
      } catch (error: unknown) {
        this.logger.error(`Failed to index chunk ${i} for document ${documentId}`, error instanceof Error ? error.message : '');
      }
    }

    return indexed;
  }

  private async getCachedOrCreateEmbedding(text: string): Promise<number[]> {
    const hash = createHash('md5').update(text.trim().toLowerCase()).digest('hex');

    try {
      const cached = await this.db.db
        .select()
        .from(queryEmbeddingCache)
        .where(eq(queryEmbeddingCache.queryHash, hash))
        .limit(1);

      if (cached.length > 0) {
        await this.db.db
          .update(queryEmbeddingCache)
          .set({
            hitCount: sql`hit_count + 1`,
            lastUsedAt: new Date(),
          })
          .where(eq(queryEmbeddingCache.id, cached[0].id));

        return unserializeVector(cached[0].embedding);
      }
    } catch {
      // Cache miss or error, proceed to create
    }

    const embedding = await this.openai.createEmbedding(text);

    try {
      await this.db.db.insert(queryEmbeddingCache).values({
        queryHash: hash,
        embedding: serializeVector(embedding),
        hitCount: 1,
      });
    } catch {
      // Ignore cache insert errors
    }

    return embedding;
  }
}
