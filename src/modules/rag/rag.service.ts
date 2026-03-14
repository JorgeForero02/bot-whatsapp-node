import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { OpenAIService } from '../openai/openai.service';
import { VectorSearchService } from './vector-search.service';
import { RedisService } from '../queue/redis.service';
import { SettingsService } from '../settings/settings.service';
import { queryEmbeddingCache } from '../database/schema/query-embedding-cache.schema';
import { documents } from '../database/schema/documents.schema';
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
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async getActiveEmbeddingModel(): Promise<string> {
    const value = await this.settings.get('openai_embedding_model');
    return value ?? this.config.get<string>('openai.embeddingModel') ?? 'text-embedding-ada-002';
  }

  async generateResponse(
    message: string,
    systemPrompt: string | null = null,
    conversationHistory: Array<{ sender: string; message_text: string }> = [],
  ): Promise<{ response: string; context: string; similarity: number }> {
    const topK = this.config.get<number>('rag.topK') ?? 3;
    const threshold = this.config.get<number>('rag.similarityThreshold') ?? 0.7;
    const method = (this.config.get<string>('rag.similarityMethod') ?? 'cosine') as 'cosine' | 'euclidean';
    const embeddingModel = await this.getActiveEmbeddingModel();

    const embedding = await this.getCachedOrCreateEmbedding(message);
    const results = await this.vectorSearch.searchSimilar(embedding, topK, threshold, method, embeddingModel);

    let context = '';
    let bestSimilarity = 0;

    const summaryContext = await this.getKnowledgeSummaries();

    if (results.length > 0) {
      context = results.map((r) => r.chunkText).join('\n\n---\n\n');
      bestSimilarity = results[0].similarity;
    }

    const fullContext = summaryContext
      ? `[Resumen base de conocimientos]\n${summaryContext}\n\n[Fragmentos relevantes]\n${context}`
      : context;

    const response = await this.openai.generateResponse(
      message,
      fullContext,
      systemPrompt,
      undefined,
      undefined,
      conversationHistory,
    );

    return { response, context, similarity: bestSimilarity };
  }

  async indexDocument(documentId: number, contentText: string): Promise<number> {
    const chunkSize = this.config.get<number>('rag.chunkSize') ?? 900;
    const overlap = this.config.get<number>('rag.chunkOverlap') ?? 150;
    const embeddingModel = await this.getActiveEmbeddingModel();

    const chunks = chunkText(contentText, chunkSize, overlap);
    let indexed = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await this.openai.createEmbedding(chunks[i]);
        await this.vectorSearch.storeVector(
          documentId, chunks[i], i, embedding,
          embeddingModel, embedding.length,
        );
        indexed++;
      } catch (error: unknown) {
        this.logger.error(`Failed to index chunk ${i} for document ${documentId}`, error instanceof Error ? error.message : '');
      }
    }

    return indexed;
  }

  private async getCachedOrCreateEmbedding(text: string): Promise<number[]> {
    const model = await this.getActiveEmbeddingModel();
    const hash = createHash('md5').update(`${model}:${text.trim().toLowerCase()}`).digest('hex');

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
    } catch { }

    const embedding = await this.openai.createEmbedding(text);

    try {
      await this.db.db.insert(queryEmbeddingCache).values({
        queryHash: hash,
        embedding: serializeVector(embedding),
        hitCount: 1,
      });
    } catch { }

    return embedding;
  }

  private async getKnowledgeSummaries(): Promise<string> {
    try {
      const activeDocs = await this.db.db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.isActive, true));

      if (activeDocs.length === 0) return '';

      const client = this.redis.getClient();
      const summaries: string[] = [];

      for (const doc of activeDocs) {
        const summary = await client.get(`knowledge:summary:${doc.id}`);
        if (summary) summaries.push(summary);
      }

      return summaries.join('\n');
    } catch {
      return '';
    }
  }
}
