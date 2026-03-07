import { Module } from '@nestjs/common';
import { ClassicBotService } from './classic-bot.service';
import { FlowBuilderService } from './flow-builder.service';

@Module({
  providers: [ClassicBotService, FlowBuilderService],
  exports: [ClassicBotService, FlowBuilderService],
})
export class ClassicBotModule {}
