import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { eq, sql, desc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RagService } from '../rag/rag.service';
import { VectorSearchService } from '../rag/vector-search.service';
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
    this.logger.log(`Document deleted: ${doc['originalName']}`);
  }
}
