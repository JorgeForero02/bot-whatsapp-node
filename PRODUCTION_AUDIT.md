# 🔍 Auditoría de Producción — bot-whatsapp-node

**Fecha**: 14 de marzo de 2026  
**Auditor**: Senior Software Engineer & DevOps Architect  
**Versión analizada**: 1.0.0  
**Stack**: NestJS 11 + Fastify 5 + Drizzle ORM + MySQL + Redis/BullMQ + OpenAI

---

## 1. Resumen Ejecutivo

### ⚠️ CONDICIONAL — No listo para producción sin resolver los bloqueantes críticos

El proyecto tiene una **arquitectura sólida y bien estructurada** (NestJS modular, Drizzle ORM tipado, BullMQ para colas, validación de env con Zod). El código es consistente, sin `console.log` de debug, sin TODOs/FIXMEs olvidados, sin credenciales hardcodeadas. Sin embargo, existen **5 bloqueantes críticos** que deben resolverse antes del despliegue: la falta total de autenticación en el panel admin/API, la ausencia de tests, la falta de `.env.example`, la ausencia de Docker para producción, y un problema de performance severo en la búsqueda vectorial.

---

## 2. 🚫 Bloqueantes Críticos (DEBEN resolverse)

### CRIT-1: Panel de administración y API completamente abiertos — SIN AUTENTICACIÓN

**Severidad**: 🔴 CRÍTICA  
**Archivos**: `src/modules/panel/panel.controller.ts`, `src/common/guards/onboarding.guard.ts`

El `PanelController` expone **todos** los endpoints de administración bajo `/api/*` sin ninguna autenticación:
- `POST /api/credentials/whatsapp` — Cualquiera puede inyectar credenciales de WhatsApp
- `POST /api/credentials/openai` — Cualquiera puede cambiar la API key de OpenAI
- `POST /api/credentials/google` — Cualquiera puede cambiar credenciales de Google
- `POST /api/settings` — Cualquiera puede modificar el system prompt, modo del bot, etc.
- `POST /api/queue-flush` — Cualquiera puede borrar toda la cola de mensajes
- `POST /api/onboarding-reset` — Cualquiera puede resetear el onboarding
- `DELETE /api/documents/:id` — Cualquiera puede borrar documentos RAG
- `POST /api/flows` — Cualquiera puede modificar los flujos del bot
- `POST /api/conversations/:id/reply` — Cualquiera puede enviar mensajes WhatsApp a cualquier número

El `OnboardingGuard` (línea 14-22) explícitamente permite **todas** las rutas `/api/*` sin verificación:
```typescript
// src/common/guards/onboarding.guard.ts:14-16
if (url.startsWith('/api/') || url.startsWith('/webhook') || ...) {
  return true;
}
```

El Bull Board (`/admin/queues`) tampoco tiene protección real: el `WorkerAuthGuard` (línea 13) retorna `true` si no hay token configurado:
```typescript
// src/common/guards/worker-auth.guard.ts:13
if (!token) return true;
```

**Impacto**: Cualquier persona con acceso a la URL del servidor puede tomar control total del bot, leer conversaciones privadas, inyectar credenciales maliciosas, y enviar mensajes de WhatsApp a cualquier número.

**Recomendación**: Implementar autenticación obligatoria (JWT, session-based, o al menos Basic Auth con un token en env) para todos los endpoints `/api/*` y `/admin/*`. Como mínimo inmediato, proteger con un middleware de token Bearer.

---

### CRIT-2: Cero tests — No existe ningún archivo de test

**Severidad**: 🔴 CRÍTICA  
**Evidencia**: No se encontró ningún archivo `*.test.ts` ni `*.spec.ts` en `src/`. El `vitest.config.ts` existe pero busca `src/**/*.{test,spec}.ts` — no hay ninguno.

El proyecto tiene configuración de test (`vitest`, `@nestjs/testing` en devDependencies) pero **cero tests implementados**. Para un sistema que procesa mensajes de WhatsApp en producción, maneja credenciales encriptadas, y opera un pipeline RAG, esto es un riesgo grave.

**Impacto**: Cualquier cambio puede introducir regresiones silenciosas. No hay forma automatizada de verificar que el sistema funciona correctamente.

**Recomendación mínima antes de prod**:
1. Tests unitarios para: `EncryptionService` (encrypt/decrypt roundtrip), `WhatsAppService.parseWebhookPayload`, `WhatsAppService.verifyWebhook`, `CalendarFlowHandler.resolveDate/resolveTime`, `ClassicBotService.matchKeywords`
2. Test de integración para: webhook signature validation, flujo completo de procesamiento de mensaje

---

### CRIT-3: No existe `.env.example`

**Severidad**: 🔴 CRÍTICA  
**Evidencia**: `find .env*` retorna 0 resultados (`.env` está en `.gitignore`, correcto, pero no hay `.env.example`).

El README documenta las variables en una tabla, pero no hay archivo `.env.example` en el repositorio. Esto significa:
- Un desarrollador nuevo no sabe qué variables necesita
- No hay referencia de formato validable
- El `cp .env.example .env` del README falla

**Recomendación**: Crear `.env.example` con todas las variables del `env.schema.ts` y valores placeholder.

---

### CRIT-4: Sin Docker / Infraestructura de despliegue

**Severidad**: 🔴 CRÍTICA  
**Evidencia**: No existe `Dockerfile`, `docker-compose.yml`, ni ningún archivo de configuración de despliegue.

Para producción se necesita como mínimo:
- `Dockerfile` multi-stage (build + runtime)
- `docker-compose.yml` con MySQL + Redis + app
- Configuración de health checks
- Estrategia de proceso (PM2, systemd, o container orchestration)

**Impacto**: No hay forma reproducible de desplegar. Dependencia total del conocimiento del operador.

**Recomendación**: Crear `Dockerfile` multi-stage y `docker-compose.prod.yml`.

---

### CRIT-5: Vector search carga TODOS los vectores en memoria

**Severidad**: 🔴 CRÍTICA  
**Archivo**: `src/modules/rag/vector-search.service.ts:28-32`

```typescript
// vector-search.service.ts:28-32
const query = embeddingModel
  ? this.db.db.select().from(vectors).where(eq(vectors.embeddingModel, embeddingModel))
  : this.db.db.select().from(vectors);
const allVectors = await query;
```

**Cada búsqueda vectorial carga TODOS los vectores de la BD en memoria** para calcular similitud en JavaScript. Con 1000 documentos × 10 chunks × 6KB/vector = ~60MB por query. Con 20 workers concurrentes = **1.2GB de RAM solo en vectores**.

**Impacto**: OOM crash en producción bajo carga media-alta. Escalabilidad lineal negativa.

**Recomendación**: 
1. Corto plazo: Agregar paginación y limitar a vectores del modelo activo (ya se hace parcialmente)
2. Medio plazo: Migrar a búsqueda vectorial nativa MySQL 9.0, pgvector, o servicio externo (Pinecone, Qdrant)

---

## 3. ⚠️ Mejoras Importantes (resolver pronto)

### IMP-1: Encryption key padding inseguro

**Archivo**: `src/modules/encryption/encryption.service.ts:13`
```typescript
this.key = Buffer.from(cipherKey.padEnd(32, '0').slice(0, 32), 'utf-8');
```

Si `APP_CIPHER_KEY` está vacío (default en env.schema es `''`), la clave será `'00000000000000000000000000000000'`. El sistema arranca sin error y "encripta" con una clave trivial.

**Recomendación**: Validar que `APP_CIPHER_KEY` tenga exactamente 32 caracteres al arranque y lanzar error si no.

---

### IMP-2: HMAC validation se puede omitir silenciosamente

**Archivo**: `src/modules/webhook/webhook.controller.ts:110-113`
```typescript
if (!appSecret) {
  this.logger.warn('app_secret not configured — skipping webhook signature validation (dev mode)');
  return; // ← Permite payloads sin verificación
}
```

Y en línea 119-122:
```typescript
if (!rawBody) {
  this.logger.warn('Raw body not available — skipping signature validation');
  return; // ← Otro bypass
}
```

En producción, si `APP_SECRET` no está configurado (default `''`), **cualquier payload es aceptado** sin verificar que viene de Meta. Un atacante podría enviar webhooks falsos.

**Recomendación**: En producción, lanzar error si `APP_SECRET` está vacío. Usar variable `NODE_ENV` para diferenciar.

---

### IMP-3: No hay rate limiting en ningún endpoint

No hay protección contra flood/DoS en:
- El webhook (`POST /webhook`) — un atacante puede inundar la cola BullMQ
- La API del panel (`/api/*`) — sin autenticación Y sin rate limit
- Upload de documentos — sin límite de requests por tiempo

**Recomendación**: Implementar `@fastify/rate-limit` o middleware equivalente.

---

### IMP-4: `APP_CIPHER_KEY` default vacío permite arranque inseguro

**Archivo**: `src/config/env.schema.ts:24`
```typescript
APP_CIPHER_KEY: z.string().default(''),
```

Todas las variables de seguridad críticas tienen defaults vacíos y permiten que el sistema arranque sin credenciales reales: `WHATSAPP_VERIFY_TOKEN` default `'your_verify_token_here'`, `APP_SECRET` default `''`, `APP_CIPHER_KEY` default `''`.

**Recomendación**: Para producción, eliminar defaults de variables de seguridad o agregar validación condicional por `NODE_ENV`.

---

### IMP-5: Sin `NODE_ENV` / diferenciación dev vs producción

No hay variable `NODE_ENV` en el schema Zod ni en la configuración. El sistema se comporta igual en dev y prod:
- HMAC skip aplica en ambos
- Debug mode solo depende de `APP_DEBUG`
- No hay diferenciación de logging levels

**Recomendación**: Agregar `NODE_ENV` al schema y usarlo para endurecer comportamiento en producción.

---

### IMP-6: `decryptSafe` retorna el valor original si la desencriptación falla

**Archivo**: `src/modules/encryption/encryption.service.ts:38-47`
```typescript
decryptSafe(value: string): string {
  try {
    if (!this.isEncrypted(value)) return value; // ← retorna plaintext
    return this.decrypt(value);
  } catch {
    this.logger.warn('Decryption failed, returning original value');
    return value; // ← retorna el valor encriptado corrupto como si fuera válido
  }
}
```

Si hay credenciales en texto plano en la BD (migración, error), se usan directamente. Si la key cambia, las credenciales se retornan corruptas sin error claro.

**Recomendación**: Logear claramente cuando se retorna un valor no encriptado y no asumir que es válido.

---

### IMP-7: Credential cache sin TTL ni invalidación automática

**Archivo**: `src/modules/credentials/credential.service.ts:31-33`

Los caches de credenciales (`whatsappCache`, `openaiCache`, `googleCache`) se invalidan solo al guardar nuevas credenciales. Si otro proceso o acceso directo a BD cambia las credenciales, el cache queda stale indefinidamente hasta reinicio.

**Recomendación**: Agregar TTL al cache o invalidación periódica.

---

### IMP-8: Ausencia de logging estructurado (pino configurado pero no usado)

`nestjs-pino` y `pino` están en dependencies pero **no se importan ni configuran en ningún módulo**. Se usa `Logger` de NestJS (que solo es `console.log` formateado). En producción se necesita logging JSON estructurado para agregación.

**Recomendación**: Configurar `LoggerModule` de `nestjs-pino` en `AppModule`.

---

## 4. 📋 Deuda Técnica Menor (backlog)

### DT-1: `getMessagesLast7Days` hace 7 queries secuenciales
**Archivo**: `src/modules/conversation/conversation.service.ts:222-239`  
Podría ser una sola query con `GROUP BY DATE(created_at)`.

### DT-2: `createBatchEmbeddings` es secuencial
**Archivo**: `src/modules/openai/openai.service.ts:333-343`  
Procesa embeddings uno a uno. Podría usar la API batch de OpenAI o paralelizar con `Promise.all` con concurrency limit.

### DT-3: `saveSettings` hace N queries secuenciales (N+1)
**Archivo**: `src/modules/panel/panel.controller.ts:231-249`  
Para cada setting: SELECT + UPDATE/INSERT. Podría usar `ON DUPLICATE KEY UPDATE` en batch.

### DT-4: `getFlowTree` hace N+1 queries
**Archivo**: `src/modules/classic-bot/flow-builder.service.ts:70-96`  
Para cada nodo, hace una query adicional para obtener opciones. Podría ser un JOIN o query batch.

### DT-5: Archivos `vista php/` en el repositorio
El directorio `vista php/` contiene código PHP legacy que no pertenece al proyecto Node.js. Debería moverse o eliminarse.

### DT-6: `webhook-processor.service.ts` parece dead code
**Archivo**: `src/modules/webhook/webhook-processor.service.ts`  
Este servicio duplica funcionalidad del `webhook.processor.ts` (BullMQ) pero no se importa en ningún módulo. Parece código de una versión anterior.

### DT-7: `releaseLock` no verifica ownership
**Archivo**: `src/modules/queue/redis.service.ts:54-56`  
```typescript
async releaseLock(key: string): Promise<void> {
  await this.getClient().del(key);
}
```
Debería verificar que el lock pertenece al job que lo libera (comparar value) usando un Lua script atómico.

### DT-8: `sourceMap: true` en `tsconfig.json` para producción
Los source maps no deberían ir a producción (exponen código fuente). Usar solo en desarrollo.

### DT-9: Knowledge summary cache con TTL corto (1h)
**Archivo**: `src/modules/documents/document.service.ts:147`  
El summary de documentos expira cada hora y se regenera con una llamada a OpenAI, costando tokens innecesariamente. Debería tener TTL más largo o ser persistente.

### DT-10: Sin CORS configurado
No hay configuración de CORS. Si el panel se sirve desde otro dominio, fallará. Para mismo dominio está bien pero debería ser explícito.

---

## 5. ✅ Checklist Final

### 🔐 Seguridad
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ✅ | Credenciales hardcodeadas | No hay credenciales en código. Todo viene de env/BD |
| ✅ | `.env` en `.gitignore` | Correcto, `.env` excluido del repo |
| ❌ | **Autenticación panel/API** | **CRIT-1**: Sin auth en ningún endpoint admin |
| ✅ | Validación env al arranque | Zod schema valida todas las variables |
| ⚠️ | Defaults inseguros en env | **IMP-4**: `APP_CIPHER_KEY`, `APP_SECRET` default vacíos |
| ✅ | SQL injection | Drizzle ORM con queries parametrizadas. Sin raw SQL vulnerable |
| ✅ | XSS (backend) | Templates Handlebars escapan por defecto. No hay HTML dinámico peligroso |
| ⚠️ | CSRF | No hay protección CSRF (las APIs son stateless, pero el panel usa forms) |
| ✅ | Webhook HMAC validation | `timingSafeEqual` correctamente implementado |
| ⚠️ | HMAC bypass en dev mode | **IMP-2**: Se omite si `APP_SECRET` vacío |
| ⚠️ | Encryption key padding | **IMP-1**: Key trivial si `APP_CIPHER_KEY` vacío |
| ❌ | Rate limiting | **IMP-3**: Sin rate limit en ningún endpoint |
| ✅ | Archivos sensibles en repo | No hay keys, certs, ni .env en el repo |
| ⚠️ | Bull Board sin auth real | **CRIT-1**: Abierto si `BULL_BOARD_TOKEN` vacío |

### 🏗️ Arquitectura y Código
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ✅ | Manejo de errores | Global exception filter. Try/catch con logging en todos los servicios |
| ✅ | Sin try/catch vacíos peligrosos | Los catch vacíos son "best effort" en operaciones no críticas (cache, temp cleanup) |
| ✅ | Sin console.log de debug | 0 `console.log` en todo `src/`. Solo `Logger` de NestJS |
| ✅ | Sin TODOs/FIXMEs | 0 resultados de TODO/FIXME/HACK/XXX |
| ⚠️ | Dead code | **DT-6**: `webhook-processor.service.ts` no se usa |
| ✅ | Dependencias modernas | NestJS 11, Fastify 5, TypeScript 5.7, Node 22 |
| ⚠️ | Logging estructurado | **IMP-8**: pino instalado pero no configurado |
| ✅ | TypeScript strict | `strict: true`, `strictNullChecks`, `noImplicitAny` habilitados |

### ⚙️ Configuración y Entorno
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ❌ | `.env.example` | **CRIT-3**: No existe |
| ❌ | Docker | **CRIT-4**: Sin Dockerfile ni docker-compose |
| ⚠️ | NODE_ENV | **IMP-5**: No hay diferenciación dev/prod |
| ✅ | Variables documentadas | README tiene tabla completa de env vars |
| ✅ | Validación de env | Zod schema con tipos y defaults |

### 🗄️ Base de Datos
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ✅ | Schema definido | 16 schemas Drizzle tipados |
| ✅ | Índices en columnas frecuentes | Índices compuestos en `conversations`, `messages`, `webhook_queue`, `vectors` |
| ✅ | Seeds separados | `DatabaseSeedService` inserta datos iniciales con `ON DUPLICATE KEY` |
| ✅ | Foreign keys con cascade | `messages.conversationId` → cascade delete |
| ⚠️ | Migraciones | Se usa `drizzle-kit push` (sync directo), no migraciones versionadas para prod |
| ❌ | Backup strategy | No documentada |
| ⚠️ | Limpieza de datos stale | `webhook_queue` puede crecer indefinidamente (cleanup al startup pero no periódico) |

### 🚀 Performance
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ❌ | **Vector search full scan** | **CRIT-5**: Carga todos los vectores en memoria por cada query |
| ⚠️ | N+1 en settings save | **DT-3**: Loop de SELECT+UPDATE por setting |
| ⚠️ | N+1 en flow tree | **DT-4**: Query por nodo para obtener opciones |
| ⚠️ | Sequential chart query | **DT-1**: 7 queries para gráfico de 7 días |
| ✅ | Redis caching | System prompt y bot_mode cacheados (TTL 300s) |
| ✅ | Embedding cache | Query embeddings cacheados en BD (query_embedding_cache) |
| ✅ | Connection pooling | MySQL pool con `connectionLimit: 10` |
| ✅ | Paginación | Conversaciones paginadas con limit/offset |
| ✅ | File upload limits | 10MB max, tipos restringidos (pdf/txt/docx) |
| ✅ | BullMQ concurrency | 20 workers concurrentes con backoff exponencial |
| ✅ | Per-phone locking | Redis SETNX lock previene race conditions por usuario |

### 📋 Documentación y Mantenimiento
| Estado | Aspecto | Detalle |
|--------|---------|---------|
| ✅ | README | Completo con instalación, variables, errores comunes, arquitectura |
| ❌ | Tests | **CRIT-2**: 0 tests en todo el proyecto |
| ⚠️ | API docs | No hay OpenAPI/Swagger. Endpoints solo documentados en README |
| ⚠️ | Changelog | No hay CHANGELOG.md ni versionado semántico |
| ✅ | Errores comunes documentados | 10 errores comunes con causa y solución en README |
| ✅ | Arquitectura documentada | Árbol de módulos documentado en README |

---

## 6. Resumen de Acciones por Prioridad

### Antes de producción (bloqueantes)
1. **Implementar autenticación** en `/api/*` y `/admin/*` (CRIT-1)
2. **Escribir tests mínimos** para servicios críticos (CRIT-2)
3. **Crear `.env.example`** (CRIT-3)
4. **Crear Dockerfile + docker-compose** (CRIT-4)
5. **Optimizar vector search** para no cargar todo en memoria (CRIT-5)

### Primera semana post-deploy
6. Endurecer encryption key validation (IMP-1)
7. Forzar HMAC en producción (IMP-2)
8. Agregar rate limiting (IMP-3)
9. Agregar `NODE_ENV` (IMP-5)
10. Configurar pino para logging estructurado (IMP-8)

### Backlog
11. Optimizar queries N+1 (DT-1, DT-3, DT-4)
12. Limpiar dead code (DT-6)
13. Fix releaseLock sin ownership check (DT-7)
14. Remover source maps en prod build (DT-8)
15. Eliminar `vista php/` del repo (DT-5)

---

*Fin del reporte de auditoría*
