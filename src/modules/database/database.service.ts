import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

export type DrizzleDB = MySql2Database<typeof schema>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: mysql.Pool | null = null;
  private _db: DrizzleDB | null = null;

  constructor(private readonly config: ConfigService) {}

  get db(): DrizzleDB {
    if (!this._db) {
      this.pool = mysql.createPool({
        host: this.config.getOrThrow<string>('database.host'),
        port: this.config.getOrThrow<number>('database.port'),
        user: this.config.getOrThrow<string>('database.user'),
        password: this.config.get<string>('database.password') ?? '',
        database: this.config.getOrThrow<string>('database.name'),
        waitForConnections: true,
        connectionLimit: 25,
        timezone: '+00:00',
      });
      this._db = drizzle(this.pool, { schema, mode: 'default' });
    }
    return this._db;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
