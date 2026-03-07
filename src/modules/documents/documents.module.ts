import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
