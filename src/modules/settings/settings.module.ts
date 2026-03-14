import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { RedisService } from '../queue/redis.service';

@Global()
@Module({
  providers: [SettingsService, RedisService],
  exports: [SettingsService, RedisService],
})
export class SettingsModule {}
