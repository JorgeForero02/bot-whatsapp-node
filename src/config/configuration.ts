import { envSchema } from './env.schema';

const WHATSAPP_API_VERSION = 'v21.0';
const WHATSAPP_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_OPENAI_TEMPERATURE = 0.7;
const DEFAULT_OPENAI_MAX_TOKENS = 500;
const DEFAULT_RAG_CHUNK_SIZE = 900;
const DEFAULT_RAG_CHUNK_OVERLAP = 150;
const DEFAULT_RAG_TOP_K = 3;
const DEFAULT_RAG_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_MAX_UPLOAD_BYTES = 10485760;
const DEFAULT_TIMEZONE = 'America/Bogota';

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
      apiVersion: WHATSAPP_API_VERSION,
      baseUrl: WHATSAPP_BASE_URL,
    },
    openai: {
      apiKey: parsed.OPENAI_API_KEY,
      model: parsed.OPENAI_MODEL,
      embeddingModel: parsed.OPENAI_EMBEDDING_MODEL,
      temperature: DEFAULT_OPENAI_TEMPERATURE,
      maxTokens: DEFAULT_OPENAI_MAX_TOKENS,
    },
    rag: {
      chunkSize: DEFAULT_RAG_CHUNK_SIZE,
      chunkOverlap: DEFAULT_RAG_CHUNK_OVERLAP,
      topK: DEFAULT_RAG_TOP_K,
      similarityThreshold: DEFAULT_RAG_SIMILARITY_THRESHOLD,
      similarityMethod: 'cosine' as const,
      vectorSearchLimit: parsed.VECTOR_SEARCH_LIMIT,
    },
    uploads: {
      maxSize: DEFAULT_MAX_UPLOAD_BYTES,
      allowedTypes: ['pdf', 'txt', 'docx'] as const,
    },
    app: {
      baseUrl: parsed.APP_BASE_URL,
      debug: parsed.APP_DEBUG,
      cipherKey: parsed.APP_CIPHER_KEY,
      timezone: DEFAULT_TIMEZONE,
      nodeEnv: parsed.NODE_ENV,
      apiPanelToken: parsed.API_PANEL_TOKEN,
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
