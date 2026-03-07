import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarIntentService } from './calendar-intent.service';
import { CalendarFlowHandler } from './calendar-flow.handler';
import { ClassicCalendarFlowHandler } from './classic-calendar-flow.handler';
import { OpenAIModule } from '../openai/openai.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [HttpModule, OpenAIModule, CredentialsModule],
  providers: [
    GoogleCalendarService,
    CalendarIntentService,
    CalendarFlowHandler,
    ClassicCalendarFlowHandler,
  ],
  exports: [
    GoogleCalendarService,
    CalendarIntentService,
    CalendarFlowHandler,
    ClassicCalendarFlowHandler,
  ],
})
export class CalendarModule {}
