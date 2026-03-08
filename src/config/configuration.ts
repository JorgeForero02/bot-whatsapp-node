import { envSchema } from './env.schema';

export default () => {
  const parsed = envSchema.parse(process.env);

  return {
    database: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      name: parsed.DB_NAME,
      user: parsed.DB_USER,
      password: parsed.DB_PASSWORD,
    },
    whatsapp: {
      accessToken: parsed.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: parsed.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: parsed.WHATSAPP_VERIFY_TOKEN,
      appSecret: parsed.APP_SECRET,
      apiVersion: 'v21.0',
      baseUrl: 'https://graph.facebook.com',
    },
    openai: {
      apiKey: parsed.OPENAI_API_KEY,
      model: parsed.OPENAI_MODEL,
      embeddingModel: parsed.OPENAI_EMBEDDING_MODEL,
      temperature: 0.7,
      maxTokens: 500,
    },
    rag: {
      chunkSize: 500,
      chunkOverlap: 50,
      topK: 3,
      similarityThreshold: 0.7,
      similarityMethod: 'cosine' as const,
    },
    uploads: {
      maxSize: 10485760,
      allowedTypes: ['pdf', 'txt', 'docx'] as const,
    },
    app: {
      baseUrl: parsed.APP_BASE_URL,
      debug: parsed.APP_DEBUG,
      cipherKey: parsed.APP_CIPHER_KEY,
      timezone: 'America/Bogota',
    },
    google: {
      accessToken: parsed.GOOGLE_CALENDAR_ACCESS_TOKEN,
      refreshToken: parsed.GOOGLE_CALENDAR_REFRESH_TOKEN,
      clientId: parsed.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CALENDAR_CLIENT_SECRET,
      calendarId: parsed.GOOGLE_CALENDAR_ID,
    },
    redis: {
      url: parsed.REDIS_URL,
    },
    r2: {
      accountId: parsed.CLOUDFLARE_R2_ACCOUNT_ID,
      accessKeyId: parsed.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: parsed.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      bucketName: parsed.CLOUDFLARE_R2_BUCKET_NAME,
      publicUrl: parsed.CLOUDFLARE_R2_PUBLIC_URL,
    },
    bullBoard: {
      token: parsed.BULL_BOARD_TOKEN,
    },
  };
};
