import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { OpenAIService } from '../openai/openai.service';
import { VectorSearchService } from './vector-search.service';
import { RedisService } from '../queue/redis.service';
import { documents } from '../database/schema/documents.schema';
import { vectors } from '../database/schema/vectors.schema';
import { queryEmbeddingCache } from '../database/schema/query-embedding-cache.schema';
import { chunkText } from '../../common/helpers/text-processor';
import { ConfigService } from '@nestjs/config';

export interface ReindexJobData {
  newModel: string;
  jobId: string;
}

@Processor('reindex-queue', { concurrency: 1 })
export class ReindexProcessor extends WorkerHost {
  private readonly logger = new Logger(ReindexProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly openai: OpenAIService,
    private readonly vectorSearch: VectorSearchService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ReindexJobData>): Promise<void> {
    const { newModel, jobId } = job.data;
    const progressKey = `reindex:progress:${jobId}`;
    const statusKey = `reindex:status:${jobId}`;

    this.logger.log(`Starting reindex job ${jobId} with model ${newModel}`);

    try {
      await this.redis.getClient().set(statusKey, 'running', 'EX', 86400);
      await this.redis.getClient().set(progressKey, '0', 'EX', 86400);

      await this.db.db.delete(queryEmbeddingCache);
      this.logger.log('Reindex: cleared query embedding cache');

      const oldModels = await this.db.db
        .selectDistinct({ embeddingModel: vectors.embeddingModel })
        .from(vectors);
      const modelsToDelete = oldModels
        .map((r) => r.embeddingModel)
        .filter((m) => m !== newModel);

      await this.db.db
        .update(documents)
        .set({ reindexStatus: 'processing' });

      const allDocs = await this.db.db
        .select({ id: documents.id, contentText: documents.contentText, originalName: documents.originalName })
        .from(documents);

      if (allDocs.length === 0) {
        await this.redis.getClient().set(progressKey, '100', 'EX', 86400);
        await this.redis.getClient().set(statusKey, 'done', 'EX', 86400);
        await this.db.db.update(documents).set({ reindexStatus: 'done' });
        return;
      }

      const chunkSize = this.config.get<number>('rag.chunkSize') ?? 900;
      const overlap = this.config.get<number>('rag.chunkOverlap') ?? 150;
      let processed = 0;

      for (const doc of allDocs) {
        try {
          const chunks = chunkText(doc.contentText, chunkSize, overlap);
          let indexed = 0;

          await this.vectorSearch.deleteVectorsByDocument(doc.id);

          for (let i = 0; i < chunks.length; i++) {
            try {
              const embedding = await this.openai.createEmbedding(chunks[i]);
              await this.vectorSearch.storeVector(
                doc.id, chunks[i], i, embedding,
                newModel, embedding.length,
              );
              indexed++;
            } catch (error: unknown) {
              this.logger.error(
                `Reindex: Failed chunk ${i} for doc ${doc.id}`,
                error instanceof Error ? error.message : '',
              );
            }
          }

          await this.db.db
            .update(documents)
            .set({ chunkCount: indexed, reindexStatus: 'done' })
            .where(eq(documents.id, doc.id));

          this.logger.log(`Reindex: doc ${doc.id} (${doc.originalName}) — ${indexed} chunks`);
        } catch (error: unknown) {
          this.logger.error(
            `Reindex: Failed document ${doc.id}`,
            error instanceof Error ? error.message : '',
          );
          await this.db.db
            .update(documents)
            .set({ reindexStatus: 'done' })
            .where(eq(documents.id, doc.id));
        }

        processed++;
        const progress = Math.round((processed / allDocs.length) * 100);
        await this.redis.getClient().set(progressKey, String(progress), 'EX', 86400);
      }

      for (const oldModel of modelsToDelete) {
        try {
          await this.vectorSearch.deleteVectorsByModel(oldModel);
          this.logger.log(`Reindex: deleted old vectors for model ${oldModel}`);
        } catch (error: unknown) {
          this.logger.error(`Reindex: failed to delete old vectors for ${oldModel}`, error instanceof Error ? error.message : '');
        }
      }

      await this.redis.getClient().set(progressKey, '100', 'EX', 86400);
      await this.redis.getClient().set(statusKey, 'done', 'EX', 86400);
      this.logger.log(`Reindex job ${jobId} completed successfully`);
    } catch (error: unknown) {
      this.logger.error(`Reindex job ${jobId} failed`, error instanceof Error ? error.message : '');
      await this.redis.getClient().set(statusKey, 'failed', 'EX', 86400);
      await this.db.db.update(documents).set({ reindexStatus: 'done' });
      throw error;
    }
  }
}
