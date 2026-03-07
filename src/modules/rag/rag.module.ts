import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { VectorSearchService } from './vector-search.service';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [OpenAIModule],
  providers: [RagService, VectorSearchService],
  exports: [RagService, VectorSearchService],
})
export class RagModule {}
