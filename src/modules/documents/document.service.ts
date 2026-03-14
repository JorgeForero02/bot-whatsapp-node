import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { eq, sql, desc, count, sum } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RagService } from '../rag/rag.service';
import { VectorSearchService } from '../rag/vector-search.service';
import { OpenAIService } from '../openai/openai.service';
import { RedisService } from '../queue/redis.service';
import { documents } from '../database/schema/documents.schema';
import { extractText } from '../../common/helpers/text-processor';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly rag: RagService,
    private readonly vectorSearch: VectorSearchService,
    private readonly openai: OpenAIService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async uploadDocument(
    filepath: string,
    originalName: string,
    fileType: string,
    fileSize: number,
  ): Promise<{ id: number; chunkCount: number }> {
    const maxSize = this.config.get<number>('uploads.maxSize') ?? 10485760;
    const allowedTypes = this.config.get<readonly string[]>('uploads.allowedTypes') ?? ['pdf', 'txt', 'docx'];

    if (fileSize > maxSize) {
      throw new BadRequestException(`File too large. Max size: ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    if (!allowedTypes.includes(fileType.toLowerCase())) {
      throw new BadRequestException(`File type not allowed: ${fileType}`);
    }

    const contentText = await extractText(filepath, fileType);

    const fileHash = createHash('md5').update(contentText).digest('hex');
    const existing = await this.db.db
      .select()
      .from(documents)
      .where(eq(documents.fileHash, fileHash))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('A document with the same content already exists');
    }

    const result = await this.db.db.insert(documents).values({
      filename: `${Date.now()}_${originalName}`,
      originalName,
      fileType: fileType.toLowerCase(),
      contentText,
      fileSize,
      fileHash,
      isActive: true,
    });

    const documentId = Number(result[0].insertId);
    const chunkCount = await this.rag.indexDocument(documentId, contentText);

    await this.db.db
      .update(documents)
      .set({ chunkCount })
      .where(eq(documents.id, documentId));

    try {
      await this.cacheKnowledgeSummary(documentId, contentText);
    } catch (error: unknown) {
      this.logger.warn(`Failed to cache knowledge summary for doc ${documentId}`, error instanceof Error ? error.message : '');
    }

    this.logger.log(`Document uploaded: ${originalName} (${chunkCount} chunks)`);
    return { id: documentId, chunkCount };
  }

  async getDocument(id: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    return rows[0] as Record<string, unknown> ?? null;
  }

  async getAllDocuments(): Promise<Record<string, unknown>[]> {
    const rows = await this.db.db
      .select()
      .from(documents)
      .orderBy(desc(documents.createdAt));
    return rows as Record<string, unknown>[];
  }

  async deleteDocument(id: number): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) throw new NotFoundException('Document not found');

    await this.vectorSearch.deleteVectorsByDocument(id);
    await this.db.db.delete(documents).where(eq(documents.id, id));

    try {
      await this.redis.getClient().del(`knowledge:summary:${id}`);
    } catch { }

    this.logger.log(`Document deleted: ${doc['originalName']}`);
  }

  async getStats(): Promise<{ totalDocuments: number; byType: Record<string, number>; totalSize: number; totalChunks: number }> {
    const rows = await this.db.db
      .select({
        fileType: documents.fileType,
        fileSize: documents.fileSize,
        chunkCount: documents.chunkCount,
      })
      .from(documents);

    const byType: Record<string, number> = {};
    let totalSize = 0;
    let totalChunks = 0;

    for (const row of rows) {
      byType[row.fileType] = (byType[row.fileType] ?? 0) + 1;
      totalSize += row.fileSize ?? 0;
      totalChunks += row.chunkCount ?? 0;
    }

    return { totalDocuments: rows.length, byType, totalSize, totalChunks };
  }

  private async cacheKnowledgeSummary(docId: number, contentText: string): Promise<void> {
    const snippet = contentText.substring(0, 3000);
    const summary = await this.openai.generateResponse(
      `Resume el siguiente documento en máximo 200 palabras. Solo devuelve el resumen, sin prefijos ni explicaciones:\n\n${snippet}`,
      '',
      'Eres un asistente que genera resúmenes concisos de documentos.',
      0.3,
      300,
    );
    await this.redis.getClient().set(`knowledge:summary:${docId}`, summary, 'EX', 3600);
    this.logger.log(`Knowledge summary cached for doc ${docId}`);
  }

  async getKnowledgeSummary(docId: number): Promise<string | null> {
    try {
      const cached = await this.redis.getClient().get(`knowledge:summary:${docId}`);
      if (cached) return cached;

      const doc = await this.getDocument(docId);
      if (!doc || !doc['contentText']) return null;

      await this.cacheKnowledgeSummary(docId, doc['contentText'] as string);
      return await this.redis.getClient().get(`knowledge:summary:${docId}`);
    } catch {
      return null;
    }
  }
}
