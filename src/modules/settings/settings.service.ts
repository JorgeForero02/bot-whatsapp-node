import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../queue/redis.service';
import { settings } from '../database/schema/settings.schema';

const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = 'settings:';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async get(key: string): Promise<string | null>;
  async get(key: string, defaultValue: string): Promise<string>;
  async get(key: string, defaultValue?: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${key}`;

    try {
      const cached = await this.redis.getClient().get(cacheKey);
      if (cached !== null) return cached;
    } catch { }

    try {
      const rows = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, key))
        .limit(1);

      if (rows.length > 0 && rows[0].settingValue) {
        const value = rows[0].settingValue;
        try {
          await this.redis.getClient().set(cacheKey, value, 'EX', CACHE_TTL_SECONDS);
        } catch { }
        return value;
      }
    } catch { }

    return defaultValue ?? null;
  }

  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.db.select().from(settings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return result;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.db
      .insert(settings)
      .values({ settingKey: key, settingValue: value })
      .onDuplicateKeyUpdate({ set: { settingValue: value } });

    try {
      await this.redis.getClient().set(`${CACHE_PREFIX}${key}`, value, 'EX', CACHE_TTL_SECONDS);
    } catch { }
  }
}
