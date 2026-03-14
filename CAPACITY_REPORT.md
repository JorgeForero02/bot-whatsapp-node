# Proyección de Capacidad — bot-whatsapp-node

> Generado: 2026-03-14 | Basado en análisis estático del código fuente

---

## 1. Inventario de Recursos Actuales

| Recurso | Valor actual | Ubicación |
|---------|-------------|-----------|
| MySQL `connectionLimit` | **10** | `database.service.ts:25` |
| MySQL `waitForConnections` | `true` | `database.service.ts:24` |
| BullMQ worker `concurrency` | **20** (processor) + **20** (global) | `webhook.processor.ts:31`, `queue.module.ts:83` |
| BullMQ job `attempts` | 3, backoff exponencial 2s | `queue.module.ts:37-38` |
| `VECTOR_SEARCH_LIMIT` | **500** (default) | `env.schema.ts:44` |
| Redis cache TTL (settings) | **300s** (5 min) | `settings.service.ts:7` |
| Redis lock TTL (per-phone) | **60s** | `webhook.processor.ts:67` |
| Redis lock retry delay | **2000ms** | `webhook.processor.ts:70` |
| Redis user profile TTL | **1800s** (30 min) | `webhook.processor.ts:132` |
| Upload max size | **10 MB** (10485760 bytes) | `main.ts:8`, `configuration.ts:11` |
| Fastify bodyLimit | **default** (1 MB, no override) | `main.ts` — no se configura |
| Fastify `maxParamLength` | **default** (100) | No override |
| Rate limiting | **NINGUNO** | No `@fastify/rate-limit` en deps ni código |
| OpenAI `maxTokens` | 500 | `configuration.ts:8` |
| OpenAI `temperature` | 0.7 | `configuration.ts:7` |
| RAG `topK` | 3 | `configuration.ts:9` |
| RAG `similarityThreshold` | 0.7 | `configuration.ts:10` |
| RAG `chunkSize` | 900 chars | `configuration.ts:7` |
| Embedding model default | `text-embedding-ada-002` (1536 dims) | `env.schema.ts:17` |
| Calendar flow expiry | 30 min | `calendar-flow.handler.ts:13` |
| Classic bot session expiry | 30 min | `classic-bot.service.ts:9` |
| Conversation history limit | 10 msgs (processor) / 50 msgs (panel) | `strategies/*.ts`, `api-conversation.controller.ts` |

---

## 2. Análisis de Cuellos de Botella por Componente

### 2.1 MySQL / Drizzle ORM

**Pool: 10 conexiones.**
Cada operación que hace `await this.db.db.select/insert/update/delete` toma una conexión del pool. Con `waitForConnections: true`, la conexión #11 se bloquea hasta que otra se libere.

**Queries más costosas identificadas:**

1. **`getMessagesLast7Days()`** (`conversation.service.ts:222-238`) — Ejecuta **7 queries secuenciales** (una por día) con `COUNT(*)` y filtro por rango de timestamps. Bajo carga, consume 7 conexiones secuencialmente por cada request al dashboard.

2. **`getStats()`** (`conversation.service.ts:194-201`) — Ejecuta **6 queries en `Promise.all`**, lo que significa que usa **hasta 6 conexiones simultáneas del pool** por una sola llamada. Con pool de 10, **2 llamadas concurrentes a stats = 12 conexiones requeridas > pool de 10 → DEADLOCK.**

3. **`getAllConversations()`** (`conversation.service.ts:121-166`) — Tiene un **subquery correlacionado** en cada fila: `SELECT m.message_text FROM messages m WHERE m.conversation_id = conversations.id ORDER BY m.created_at DESC LIMIT 1`. Esto ejecuta N subqueries donde N = número de conversaciones en la página.

4. **`searchSimilar()`** (`vector-search.service.ts:40`) — Lee hasta 500 filas completas de `vectors` incluyendo columna `embedding` (varbinary 8KB). **500 × 8KB = 4MB de transferencia por query.**

5. **`CalendarFlowHandler.incrementAttempts()`** (`calendar-flow.handler.ts:601-612`) — SELECT + UPDATE en dos operaciones separadas (no atómico). Bajo alta concurrencia podría perder actualizaciones.

**Queries por mensaje procesado (flujo AI típico):**

| Operación | Queries |
|-----------|---------|
| `updateQueueStatus('processing')` | 1 UPDATE |
| `settings.get('bot_mode')` | 1 GET Redis (o 1 SELECT si miss) |
| `getOrCreateConversation()` | 1-3 (SELECT + possible UPDATE + possible INSERT + SELECT) |
| Redis profile cache set | 1 Redis SET |
| Dedup check (messages by messageId) | 1 SELECT |
| `addMessage(user)` | 1 INSERT + 1 UPDATE |
| `settings.get('system_prompt')` | 1 Redis GET (o 1 SELECT) |
| `getConversationHistory(10)` | 1 SELECT |
| CalendarStrategy: `getFlowState()` | 1 SELECT |
| RAG: `getCachedOrCreateEmbedding()` | 1 SELECT (cache) |
| RAG: `searchSimilar()` | 1 SELECT (heavy, 500 rows) |
| RAG: `getKnowledgeSummaries()` | 1 SELECT + N Redis GETs |
| `addMessage(bot)` | 1 INSERT + 1 UPDATE |
| `updateQueueStatus('completed')` | 1 UPDATE |
| **Total MySQL por mensaje AI** | **~11-14 queries** |

**Índices:** El esquema tiene índices bien diseñados. `conversations.phoneNumber` tiene `uniqueIndex`, `messages` tiene composite `(conversationId, createdAt)`, `vectors` tiene `idx_embedding_model`. No hay índices faltantes críticos.

**Límite teórico del pool de 10:**
- Latencia promedio de query MySQL simple: ~2-5ms
- Una conexión puede servir ~200-500 queries/segundo
- Pool de 10 = máximo teórico ~2000-5000 queries/segundo
- Con 14 queries/mensaje y procesamiento de 20 msgs concurrentes: **280 queries simultáneas en ráfaga → OK para el pool si cada query es rápida**
- **PERO**: `getStats()` con 6 `Promise.all` es el riesgo real. Si 2 admins abren el dashboard simultáneamente = pool exhaustion.

---

### 2.2 Redis / BullMQ

**Conexiones Redis:**
- 1 conexión ioredis directa (`RedisService`)
- N conexiones BullMQ internas (típicamente 3-6: subscriber, command, worker × concurrency groups)
- Total estimado: **~8-10 conexiones Redis**

**Concurrencia BullMQ:**
- `@Processor('webhook-queue', { concurrency: 20 })` en el decorator
- `setGlobalConcurrency(20)` en `onModuleInit`
- Resultado: **máximo 20 jobs procesándose simultáneamente**

**Per-phone lock (`SETNX` con TTL 60s):**
- Lock key: `lock:phone:{phoneNumber}`
- Si el lock no se adquiere, el job se retrasa 2 segundos
- Un usuario que envía mensajes rápido: solo 1 mensaje se procesa a la vez por teléfono
- **Riesgo:** Si un job falla sin liberar el lock (crash), el teléfono queda bloqueado **60 segundos**. El `finally` block llama `releaseLock`, pero un crash catastrófico del proceso no lo ejecutaría.

**Saturación con 500 usuarios:**
- 500 usuarios × 1 msg/30s = ~17 msgs/segundo
- Con concurrencia 20, cada job tarda ~3-5s (esperando OpenAI) → throughput real: **~4-7 jobs/segundo**
- Cola se llena: 17 entrantes - 5 procesados = **~12 jobs/segundo de backlog**
- **Después de 1 minuto: ~720 jobs acumulados**
- Latencia end-to-end con 500 usuarios: **>2 minutos** y creciendo

---

### 2.3 Vector Search (RAG)

**Memoria por búsqueda con `VECTOR_SEARCH_LIMIT=500`:**
- Embedding `text-embedding-ada-002`: 1536 dimensiones × 4 bytes = **6,144 bytes por vector**
- 500 vectors en memoria: 500 × 6,144 = **~3 MB de datos crudos de embeddings**
- Más los objetos JS (chunkText ~500 chars avg): 500 × 500 = **~250 KB de texto**
- Más overhead de objetos JS y arrays intermedios: **~2 MB**
- **Total por búsqueda: ~5-6 MB de heap**

**Cálculo de coseno por búsqueda:**
- 500 vectores × 1536 dimensiones × 3 operaciones (dot, normA, normB) = **~2.3M operaciones float**
- Tiempo CPU estimado: **~5-15ms** (V8 es eficiente con loops numéricos)

**Búsquedas simultáneas:**
- 20 workers BullMQ × 30% RAG = **~6 búsquedas simultáneas** en peak
- 6 × 6 MB = **~36 MB de heap adicional** en peak para vectores
- No es OOM con estos números, pero con `VECTOR_SEARCH_LIMIT=2000`: 6 × 24 MB = **144 MB**

**Riesgo real:** No es OOM con 500 rows. El verdadero cuello de botella es que **la query MySQL lee 500 filas completas con embedding binario**, lo que ocupa una conexión del pool por más tiempo del necesario.

---

### 2.4 OpenAI API

**Llamadas por mensaje AI:**
1. `createEmbedding()` — 1 llamada (a menos que esté cacheada en `query_embedding_cache`)
2. `generateResponse()` — 1 llamada chat completion
3. Total: **1-2 llamadas a OpenAI por mensaje**

**Para flujo Calendar con intent detection:**
1. `CalendarIntentService.detectIntent()` — 1 llamada con tools
2. Posible: `createEmbedding()` + `generateResponse()` si no es calendar
3. Total: **1-3 llamadas por mensaje calendario**

**Rate limits OpenAI (Tier 1 típico):**
- gpt-3.5-turbo: 3,500 RPM, 200,000 TPM
- text-embedding-ada-002: 3,000 RPM, 1,000,000 TPM
- **El código NO implementa rate limiting propio ni retry con backoff para 429s** (solo detecta `INSUFFICIENT_FUNDS`)

**Las llamadas son secuenciales** dentro de cada job: embedding → search → generate. No hay paralelización intra-job.

**Latencia por llamada:**
- Embedding: ~200-500ms
- Chat completion (500 max_tokens): **~2-4 segundos**
- Whisper (audio): ~3-10 segundos dependiendo del largo

---

### 2.5 Fastify / NestJS (HTTP Layer)

**Rate limiting: NO EXISTE.** No hay `@fastify/rate-limit` en `package.json` ni en el código. Cualquier actor puede bombardear `/webhook` sin restricción.

**Webhook endpoint (`POST /webhook`):**
- Valida firma HMAC (síncrono, rápido)
- Parsea payload (síncrono)
- Inserta en `webhook_queue` table (1 query MySQL)
- Encola job en BullMQ (1 operación Redis)
- **Responde `EVENT_RECEIVED` sin esperar procesamiento** → Es non-blocking, correcto
- **Tiempo de respuesta esperado: ~10-30ms**

**Panel endpoints (`GET /api/dashboard-stats`, etc.):**
- `getStats()` → 6 queries en `Promise.all` → **~50-200ms**, consume 6 conexiones del pool
- `getMessagesLast7Days()` → 7 queries secuenciales → **~100-300ms**
- Son endpoints del panel admin, no del bot. Impacto si un admin deja el dashboard abierto con polling.

**El webhook endpoint NO es el primer punto de falla.** El primer punto de falla es el pool MySQL cuando hay dashboard polling + procesamiento concurrente.

---

## 3. Proyección por Escenario

### Supuestos base
- 1 mensaje por usuario cada 30 segundos
- 30% de usuarios usan RAG (búsqueda vectorial)
- 20% de usuarios tienen flujo de calendario activo
- Payload promedio WhatsApp: ~2KB
- Latencia promedio OpenAI chat: 3 segundos
- Latencia promedio OpenAI embedding: 300ms
- 50% flujo classic (sin OpenAI), 50% flujo AI
- 1 admin con dashboard abierto

---

### Escenario: 100 usuarios concurrentes

**Carga de red y HTTP:**
- Msgs entrantes: 100 / 30s = **3.3 msgs/segundo**
- Payload acumulado: 3.3 × 2KB = **6.6 KB/segundo** — irrelevante
- Webhook responses: ~20ms cada uno — **Fastify maneja esto sin esfuerzo**

**Cola BullMQ:**
- Jobs encolados: 3.3/segundo
- Jobs procesados (concurrency 20, ~3.5s por job AI): **~5.7 jobs/segundo**
- **La cola se vacía más rápido de lo que se llena → Sin backlog**
- Latencia end-to-end: **3-5 segundos** (dominada por latencia OpenAI)

**MySQL:**
- 3.3 msgs/s × 14 queries = **~46 queries/segundo** del procesador
- 1 admin con dashboard (cada 30s polling): ~13 queries cada 30s = **~0.4 q/s**
- **Total: ~47 queries/segundo → Pool de 10 cómodo** (capacidad: ~2000+ q/s)
- Conexiones simultáneas en uso (peak): **~3-5**
- RAM MySQL estimada: **256-512 MB**

**Redis:**
- Settings cache hits: ~3.3 × 2 = 6.6 ops/segundo (GETs)
- Locks: 3.3 acquire + 3.3 release = 6.6 ops/segundo
- BullMQ internal: ~30 ops/segundo
- Profile cache: 3.3 ops/segundo
- **Total: ~50 operaciones/segundo → trivial para Redis**
- RAM Redis: **~20-50 MB** (jobs + caches + locks)

**Vector Search (30% RAG = 1 búsqueda/segundo):**
- 1 búsqueda/s × 6 MB = **6 MB de heap peak**
- RAM adicional: irrelevante

**OpenAI:**
- 50% AI × 3.3 msg/s = 1.65 msg/s AI
- 30% RAG de esos: 0.5 embeddings/s + 1.65 completions/s
- **~99 embeddings/min + ~99 completions/min = ~198 RPM**
- Tier 1 limit: 3,500 RPM → **5.7% del límite → OK**

**RAM total Node.js:**
- Base heap: ~80-120 MB
- 20 workers con datos en vuelo: ~20 × 2 MB = 40 MB
- Vector search peak: ~6 MB
- **Total estimado: ~150-200 MB**

---

### Escenario: 250 usuarios concurrentes

**Carga de red y HTTP:**
- Msgs entrantes: 250 / 30s = **8.3 msgs/segundo**
- Webhook handling: trivial

**Cola BullMQ:**
- Jobs encolados: 8.3/segundo
- Jobs procesados: ~5.7/segundo (limitado por OpenAI latency × concurrency)
- **Backlog: +2.6 jobs/segundo acumulándose**
- **Después de 5 minutos: ~780 jobs en cola**
- Latencia end-to-end: **~15-30 segundos** (y creciendo si la carga se sostiene)
- **⚠️ CUELLO DE BOTELLA: la concurrencia de 20 workers no puede con la tasa entrante**

**MySQL:**
- 8.3 msgs/s × 14 = **~116 queries/segundo**
- Pool de 10: aún manejable en throughput puro
- **PERO:** Con backlog creciente, los workers retrying locks generan queries extra
- Peak conexiones simultáneas: **~6-8** — se acerca al límite de 10
- Si el admin abre `getStats()`: **6 conexiones en `Promise.all` + 7 conexiones en uso por workers = 13 > pool 10 → CONEXIÓN TIMEOUT**
- RAM MySQL: **512 MB - 1 GB**

**Redis:**
- ~130 operaciones/segundo → OK
- Cola creciente consume más RAM: ~780 jobs × 2KB = **~1.6 MB** extras por minuto
- Si se sostiene 1 hora: **~100 MB** en jobs pendientes
- RAM Redis: **~50-150 MB**

**Vector Search (30% × 8.3 = 2.5 búsquedas/segundo):**
- Peak simultáneo: ~8 búsquedas × 6 MB = **~48 MB**
- Manejable

**OpenAI:**
- 50% AI × 8.3 = 4.15 msg/s AI
- **~249 completions/min + ~75 embeddings/min = ~324 RPM**
- Tier 1: 3,500 RPM → **9.3% → OK**
- Pero el throughput real está limitado por `concurrency: 20`: **OpenAI no es el cuello de botella, la concurrencia del worker lo es**

**RAM total Node.js:**
- Base: ~120 MB
- 20 workers: ~50 MB
- Vector search peak: ~48 MB
- Job backlog metadata: ~20 MB
- **Total: ~250-350 MB**

---

### Escenario: 500 usuarios concurrentes

**Carga de red y HTTP:**
- Msgs entrantes: 500 / 30s = **16.7 msgs/segundo**

**Cola BullMQ:**
- Jobs procesados: ~5.7/segundo
- **Backlog: +11 jobs/segundo**
- **Después de 5 minutos: ~3,300 jobs en cola**
- Latencia end-to-end: **>5 minutos** y degradando rápidamente
- **🔴 SISTEMA COLAPSADO — los usuarios reciben respuesta minutos después**

**MySQL:**
- 16.7 × 14 = **~234 queries/segundo** (solo del procesador real, no del backlog)
- Pero el procesador solo corre 20 jobs, así que las queries reales siguen siendo ~80/s
- **El webhook endpoint inserta 16.7 rows/segundo en `webhook_queue`** — esto sí consume pool
- Webhook + processor + admin panel = **pool de 10 insuficiente**
- **🔴 Pool exhaustion frecuente, timeouts en webhook endpoint**
- RAM MySQL: **1-2 GB**

**Redis:**
- BullMQ cola masiva: 3,300 jobs × 2KB = ~6.6 MB en 5 min
- Lock contention: 500 teléfonos distintos, 20 workers → **probabilidad de colisión baja**, pero retry delays de 2s acumulan
- RAM Redis: **100-300 MB** (mayormente jobs pendientes)

**Vector Search:**
- Igual que antes, solo 20 workers corren, ~6 búsquedas simultáneas
- **~36-48 MB peak** — no cambia porque está limitado por concurrencia

**OpenAI:**
- Procesamiento real limitado a 20 concurrentes
- RPM real: igual que 250 usuarios (el backlog no acelera las llamadas)
- Pero si se sube concurrencia a 50: **~415 completions/min → 12% del Tier 1 limit**
- Con Tier 2 (10,000 RPM): sin problemas hasta miles de usuarios

**RAM total Node.js:**
- Base: ~120 MB
- 20 workers: ~50 MB
- BullMQ job metadata in memory: ~50 MB
- **Total: ~300-450 MB** (limitado por la concurrencia del worker, no por los usuarios)

---

## 4. Especificaciones de Servidor Recomendadas

### Single-server deployment (docker-compose)

| Escenario | CPU (cores) | RAM total | MySQL RAM | Redis RAM | Disco |
|-----------|-------------|-----------|-----------|-----------|-------|
| **100 usuarios** | 2 vCPU | 2 GB | 512 MB | 64 MB | 20 GB SSD |
| **250 usuarios** | 4 vCPU | 4 GB | 1 GB | 256 MB | 40 GB SSD |
| **500 usuarios** | 4-8 vCPU | 8 GB | 2 GB | 512 MB | 80 GB SSD |

### Notas:
- Para 100 usuarios, una instancia `t3.small` (AWS) o `e2-medium` (GCP) es suficiente
- Para 250 usuarios, `t3.medium` o `e2-standard-2` mínimo
- Para 500 usuarios, se necesita separar MySQL en su propia instancia o usar managed DB

---

## 5. Cambios Necesarios en el Código para Escalar

### Para 100 usuarios (funciona con ajustes menores):

| Parámetro | Actual | Recomendado | Ubicación |
|-----------|--------|-------------|-----------|
| `connectionLimit` | 10 | **15** | `database.service.ts:25` |
| BullMQ `concurrency` | 20 | 20 (OK) | — |
| `VECTOR_SEARCH_LIMIT` | 500 | 500 (OK) | — |
| Rate limit webhook | ninguno | **Agregar `@fastify/rate-limit` 100 req/min por IP** | `main.ts` |

### Para 250 usuarios (requiere cambios significativos):

| Parámetro | Actual | Recomendado | Razón |
|-----------|--------|-------------|-------|
| `connectionLimit` | 10 | **25** | `getStats()` usa 6 en paralelo + workers |
| BullMQ `concurrency` | 20 | **40** | Duplicar throughput del procesador |
| `getStats()` | 6 queries `Promise.all` | **1 query combinada con UNION ALL** | Evita consumir 6 conexiones simultáneas |
| `getMessagesLast7Days()` | 7 queries secuenciales | **1 query con GROUP BY DATE** | Reduce de 7 a 1 query |
| Rate limit | ninguno | **50 req/min por IP** | Protección contra flood |
| Fastify `bodyLimit` | default 1MB | **Configurar explícitamente 1 MB** | Documentar límite |
| Redis | single instance | single instance (OK) | Aún no necesita cluster |
| MySQL | single instance | single instance (OK) | Pero monitorear conexiones |

### Para 500 usuarios (requiere cambios arquitectónicos):

| Parámetro | Actual | Recomendado | Razón |
|-----------|--------|-------------|-------|
| `connectionLimit` | 10 | **50** | Headroom para bursts |
| BullMQ `concurrency` | 20 | **60-80** | Triplicar throughput |
| `VECTOR_SEARCH_LIMIT` | 500 | **300** (paradójicamente menos) | Reducir tiempo de query MySQL para liberar conexiones más rápido |
| **Múltiples instancias Node** | 1 | **2-3 instancias** con load balancer | El event loop de Node es single-threaded; OpenAI await bloquea el loop |
| **MySQL** | single | **Managed DB (RDS/Cloud SQL)** | Connection pooling externo, backups automáticos |
| **Redis** | single | Single (suficiente) | Redis maneja 100K+ ops/s, no necesita cluster aquí |
| OpenAI rate handling | solo `INSUFFICIENT_FUNDS` | **Agregar retry con backoff exponencial para HTTP 429** | Proteger contra throttling |
| Load balancer | ninguno | **Nginx o ALB** | Distribuir entre instancias Node |

### ¿Se necesita Redis Cluster?
**No para estos escenarios.** Un solo Redis maneja >100,000 operaciones/segundo. Con 500 usuarios la carga máxima es ~500 ops/s. Redis Cluster se justifica a partir de ~5,000+ usuarios o cuando se necesita alta disponibilidad.

### ¿Se necesitan read replicas MySQL?
**No para estos escenarios.** Las queries del bot son mayoritariamente writes (INSERT messages, UPDATE status). Read replicas ayudarían solo para el panel admin. Se justificarían a partir de ~1,000+ usuarios con múltiples admins.

### ¿Se necesita load balancer?
**A partir de 250 usuarios es recomendable; a partir de 500 es obligatorio.** El webhook de WhatsApp solo acepta un URL, pero un load balancer permite múltiples instancias Node que compiten por jobs de la cola BullMQ (worker pattern).

---

## 6. Puntos de Falla Críticos (en orden de colapso)

| # | Componente | Falla | Usuarios aprox. | Síntoma |
|---|-----------|-------|-----------------|---------|
| **1** | **BullMQ throughput** | Cola crece sin parar: 20 workers × ~3.5s/job = 5.7 jobs/s máximo | **~170 usuarios** (cuando 170/30 = 5.7 msg/s = throughput máximo) | Latencia creciente, usuarios esperan >30s por respuesta |
| **2** | **MySQL pool** | `getStats()` (6 conn en Promise.all) + workers agotan las 10 conexiones | **~150-200 usuarios** si un admin abre dashboard durante carga alta | Timeouts en queries, webhook empieza a fallar con 503 |
| **3** | **Sin rate limiting** | Flood attack o spike de WhatsApp satura el webhook | **Cualquier momento** (1 actor malicioso es suficiente) | CPU al 100%, cola explota, todas las respuestas se atrasan |
| **4** | **OpenAI latency** | Bajo carga de OpenAI, latencia sube de 3s a 8-15s, reduciendo throughput real | **~100-150 usuarios** en hora pico de OpenAI | Throughput cae a ~2 jobs/s, backlog se acumula 5x más rápido |
| **5** | **Node.js event loop** | 500+ búsquedas vectoriales con cálculos de coseno bloquean el event loop | **~300+ usuarios con 30%+ RAG** | Webhook endpoint deja de responder rápido, WhatsApp hace retry, duplicando la carga |

---

## 7. Resumen Ejecutivo

| Escenario | ¿Aguanta con config actual? | Cambio más urgente | Latencia esperada |
|-----------|:---------------------------:|--------------------|--------------------|
| **100 usuarios** | **CONDICIONAL** — Funciona si no hay admin polling activo durante hora pico | Subir `connectionLimit` a 15 y agregar rate limiting básico | 3-5 segundos |
| **250 usuarios** | **NO** — Pool MySQL se agota, cola BullMQ crece sin control | Subir `connectionLimit` a 25, subir `concurrency` a 40, optimizar `getStats()` a 1 query | 15-30 segundos |
| **500 usuarios** | **NO** — Sistema colapsa en <2 minutos | Requiere múltiples instancias Node + managed DB + `concurrency` 60+ + rate limiting + load balancer | >5 min (inaceptable) |

### Veredicto:
El sistema actual soporta **~100-150 usuarios concurrentes** sin cambios. El primer bloqueante es el **throughput de BullMQ** (concurrency 20 × 3.5s latencia OpenAI = 5.7 jobs/s). Subir la concurrencia a 40 y el pool MySQL a 25 conexiones extiende el límite a ~250 usuarios. Para 500+ usuarios se requiere una arquitectura multi-instancia con load balancer.
