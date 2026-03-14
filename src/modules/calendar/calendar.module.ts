import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarIntentService } from './calendar-intent.service';
import { CalendarFlowHandler } from './calendar-flow.handler';
import { ClassicCalendarFlowHandler } from './classic-calendar-flow.handler';
import { DateParserService } from './date-parser.service';
import { OpenAIModule } from '../openai/openai.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [HttpModule, OpenAIModule, CredentialsModule],
  providers: [
    DateParserService,
    GoogleCalendarService,
    CalendarIntentService,
    CalendarFlowHandler,
    ClassicCalendarFlowHandler,
  ],
  exports: [
    DateParserService,
    GoogleCalendarService,
    CalendarIntentService,
    CalendarFlowHandler,
    ClassicCalendarFlowHandler,
  ],
})
export class CalendarModule {}
