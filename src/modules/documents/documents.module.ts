import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { RagModule } from '../rag/rag.module';
import { OpenAIModule } from '../openai/openai.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [RagModule, OpenAIModule, QueueModule],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
