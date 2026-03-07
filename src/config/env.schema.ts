import { z } from 'zod';

export const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('whatsapp_rag_bot'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),

  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default('your_verify_token_here'),
  APP_SECRET: z.string().default(''),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-3.5-turbo'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-ada-002'),

  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_DEBUG: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  APP_CIPHER_KEY: z.string().default(''),

  GOOGLE_CALENDAR_ACCESS_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),

  PORT: z.coerce.number().default(3000),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  CLOUDFLARE_R2_ACCOUNT_ID: z.string().default(''),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().default(''),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().default(''),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().default(''),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().default(''),

  BULL_BOARD_TOKEN: z.string().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;
