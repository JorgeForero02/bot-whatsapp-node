import { Controller, Get, Post, Delete, Param, Req, Logger, HttpCode, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { FastifyRequest } from 'fastify';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { DocumentService } from '../documents/document.service';

@UseGuards(ApiAuthGuard)
@Controller('api')
export class ApiDocumentController {
  private readonly logger = new Logger(ApiDocumentController.name);

  constructor(private readonly documents: DocumentService) {}

  @Post('documents/upload')
  @HttpCode(HttpStatus.OK)
  async uploadDocument(@Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const file = await (req as FastifyRequest & { file: () => Promise<{ filename: string; mimetype: string; file: NodeJS.ReadableStream } | undefined> }).file();

    if (!file) {
      throw new HttpException('No file uploaded. Use field name "file"', HttpStatus.BAD_REQUEST);
    }

    const ext = extname(file.filename).replace('.', '').toLowerCase();
    const allowedTypes = ['pdf', 'txt', 'docx'];
    if (!allowedTypes.includes(ext)) {
      throw new HttpException(`File type not allowed: ${ext}. Allowed: ${allowedTypes.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      throw new HttpException('Empty file', HttpStatus.BAD_REQUEST);
    }

    const tempPath = join(tmpdir(), `upload_${Date.now()}_${file.filename}`);

    try {
      await writeFile(tempPath, buffer);

      const result = await this.documents.uploadDocument(
        tempPath,
        file.filename,
        ext,
        buffer.length,
      );

      return {
        success: true,
        document: {
          id: result.id,
          name: file.filename,
          size: buffer.length,
          chunks: result.chunkCount,
        },
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Upload failed', error instanceof Error ? error.message : '');
      throw new HttpException('Error al subir documento', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      try { await unlink(tempPath); } catch { }
    }
  }

  @Get('documents')
  async getDocuments(): Promise<Record<string, unknown>> {
    const docs = await this.documents.getAllDocuments();
    return { success: true, data: docs };
  }

  @Get('documents/stats')
  async getDocumentStats(): Promise<Record<string, unknown>> {
    const stats = await this.documents.getStats();
    return { success: true, data: stats };
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string): Promise<Record<string, unknown>> {
    await this.documents.deleteDocument(parseInt(id, 10));
    return { success: true };
  }

  @Get('documents/:id/content')
  async getDocumentContent(@Param('id') id: string): Promise<Record<string, unknown>> {
    const doc = await this.documents.getDocument(parseInt(id, 10));
    if (!doc) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return { success: true, data: { id: doc['id'], name: doc['originalName'], content: doc['contentText'] } };
  }
}
