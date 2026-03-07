import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenAIService } from './openai.service';

@Module({
  imports: [HttpModule],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
