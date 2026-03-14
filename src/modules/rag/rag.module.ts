import { Module, forwardRef } from '@nestjs/common';
import { RagService } from './rag.service';
import { VectorSearchService } from './vector-search.service';
import { OpenAIModule } from '../openai/openai.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [OpenAIModule, forwardRef(() => QueueModule)],
  providers: [RagService, VectorSearchService],
  exports: [RagService, VectorSearchService],
})
export class RagModule {}
