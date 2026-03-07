# WhatsApp Bot — NestJS/TypeScript

Bot de WhatsApp con IA (RAG), calendario Google, modo clásico por flujos, y panel de administración. Migración completa del proyecto PHP original.

## Requisitos del Servidor

| Componente | Versión mínima | Recomendada |
|---|---|---|
| **Node.js** | 22.0.0 | 22.x LTS |
| **MySQL** | 8.0 | 8.0+ |
| **Redis** | 6.0 | 7.x |
| **npm** | 10.0 | 10.x |

## Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo | Obligatoria |
|---|---|---|---|
| `DB_HOST` | Host de la base de datos MySQL | `localhost` | Sí |
| `DB_PORT` | Puerto de MySQL | `3306` | Sí |
| `DB_NAME` | Nombre de la base de datos | `whatsapp_rag_bot` | Sí |
| `DB_USER` | Usuario de MySQL | `root` | Sí |
| `DB_PASSWORD` | Contraseña de MySQL | `mi_password_seguro` | Sí |
| `PORT` | Puerto del servidor HTTP | `3000` | No (default: 3000) |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso de la API de WhatsApp Business (Meta) | `EAAGm0PX4ZCps...` | Sí* |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de teléfono registrado en Meta | `106540123456789` | Sí* |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificación del webhook (lo defines tú) | `mi_token_webhook_2024` | Sí |
| `APP_SECRET` | App Secret de la aplicación de Meta (para validar HMAC) | `abc123def456...` | Sí** |
| `OPENAI_API_KEY` | API Key de OpenAI para GPT y Whisper | `sk-proj-abc123...` | Sí*** |
| `OPENAI_MODEL` | Modelo de GPT a usar | `gpt-3.5-turbo` | No |
| `OPENAI_EMBEDDING_MODEL` | Modelo de embeddings para RAG | `text-embedding-ada-002` | No |
| `APP_BASE_URL` | URL pública del servidor | `https://mibot.ejemplo.com` | Sí |
| `APP_DEBUG` | Modo debug (true/false) | `false` | No |
| `APP_CIPHER_KEY` | Clave para encriptar credenciales en la BD (32 chars) | `mi_clave_secreta_de_32_chars!!!` | Sí |
| `GOOGLE_CALENDAR_ACCESS_TOKEN` | Token OAuth de Google Calendar | `ya29.a0AfH6SM...` | No |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Refresh token de Google Calendar | `1//0eXy1234...` | No |
| `GOOGLE_CALENDAR_CLIENT_ID` | Client ID de Google Cloud Console | `123456.apps.googleusercontent.com` | No |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Client Secret de Google Cloud Console | `GOCSPX-abc123...` | No |
| `GOOGLE_CALENDAR_ID` | ID del calendario (email del usuario) | `usuario@gmail.com` | No |
| `REDIS_URL` | URL de conexión a Redis | `redis://localhost:6379` | Sí |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Account ID de Cloudflare R2 | `abc123def456` | No |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Access Key de R2 | `abc123...` | No |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Secret Key de R2 | `xyz789...` | No |
| `CLOUDFLARE_R2_BUCKET_NAME` | Nombre del bucket en R2 | `whatsapp-bot-media` | No |
| `CLOUDFLARE_R2_PUBLIC_URL` | URL pública del bucket R2 | `https://media.ejemplo.com` | No |
| `BULL_BOARD_TOKEN` | Token para proteger Bull Board (si se implementa auth) | `mi_token_admin` | No |

> \* Las credenciales de WhatsApp se pueden configurar también desde el panel en `/credentials`.
> \*\* Si `APP_SECRET` está vacío, la validación HMAC se omite (modo desarrollo).
> \*\*\* Solo requerido si `bot_mode` = `ai`. En modo `classic` no se necesita.

## Instalación desde Cero

```bash
# 1. Clonar e instalar dependencias
cd bot-whatsapp-node
npm install

# 2. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores reales

# 3. Crear la base de datos en MySQL
mysql -u root -p -e "CREATE DATABASE whatsapp_rag_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Crear las tablas con Drizzle
npx drizzle-kit push

# 5. Insertar fila inicial de credenciales (requerida por el sistema)
mysql -u root -p whatsapp_rag_bot -e "INSERT INTO bot_credentials (id) VALUES (1) ON DUPLICATE KEY UPDATE id=1; INSERT INTO google_oauth_credentials (id) VALUES (1) ON DUPLICATE KEY UPDATE id=1;"

# 6. Arrancar en modo desarrollo
npm run start:dev
```

## Primer Arranque

Una vez arrancado el servidor:

| URL | Descripción |
|---|---|
| `http://localhost:3000` | Panel de administración (Dashboard) |
| `http://localhost:3000/onboarding` | Wizard de configuración inicial |
| `http://localhost:3000/admin/queues` | Bull Board — monitor de colas BullMQ |
| `http://localhost:3000/webhook` | Endpoint del webhook de WhatsApp |

El sistema tiene un **wizard de onboarding** que guía paso a paso la configuración inicial:
1. Credenciales de WhatsApp
2. Credenciales de OpenAI (omitible si usas modo clásico)
3. Personalidad del bot (system prompt)
4. Configuración de calendario (omitible)
5. Constructor de flujos (omitible si usas modo AI)
6. Test de conexión
7. Puesta en marcha

## Configurar Webhook en Meta Business Manager

1. Ir a [Meta for Developers](https://developers.facebook.com) → Tu App → WhatsApp → Configuration
2. En **Webhook URL** ingresar: `https://TU_DOMINIO/webhook`
3. En **Verify Token** ingresar el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN` de tu `.env`
4. Hacer clic en **Verify and Save**
5. En **Webhook Fields**, suscribirse a: `messages`
6. El `APP_SECRET` lo encuentras en la sección **App Settings → Basic → App Secret** de tu aplicación de Meta

## Comandos de Referencia

### Desarrollo

```bash
npm run start:dev        # Servidor con hot-reload
npm run start:debug      # Servidor con debugger
npm run typecheck        # Verificación TypeScript (tsc --noEmit)
npm run test             # Tests con Vitest
npm run test:cov         # Tests con cobertura
```

### Producción

```bash
npm run build            # Compilar TypeScript a JavaScript
npm run start:prod       # Arrancar desde dist/main.js
```

### Base de Datos

```bash
npx drizzle-kit push     # Crear/sincronizar tablas en MySQL
npx drizzle-kit generate # Generar migraciones SQL
npx drizzle-kit studio   # Explorador visual de la BD
```

## Errores Comunes al Iniciar

### 1. `Error: connect ECONNREFUSED 127.0.0.1:6379`
**Causa:** Redis no está corriendo.
**Solución:** Instalar e iniciar Redis. En Windows: usar Docker (`docker run -d -p 6379:6379 redis`) o WSL.

### 2. `Error: connect ECONNREFUSED 127.0.0.1:3306`
**Causa:** MySQL no está corriendo o las credenciales son incorrectas.
**Solución:** Verificar que MySQL esté activo y que `DB_HOST`, `DB_USER`, `DB_PASSWORD` sean correctos.

### 3. `Error: Table 'whatsapp_rag_bot.bot_credentials' doesn't exist`
**Causa:** No se ejecutó la creación de tablas.
**Solución:** Ejecutar `npx drizzle-kit push` para crear las tablas.

### 4. `Error: ER_NO_REFERENCED_ROW: Cannot add or update a child row`
**Causa:** No existe la fila inicial en `bot_credentials`.
**Solución:** Insertar la fila: `INSERT INTO bot_credentials (id) VALUES (1);`

### 5. `INSUFFICIENT_FUNDS` en logs
**Causa:** La cuenta de OpenAI no tiene créditos.
**Solución:** Recargar créditos en [platform.openai.com/account/billing](https://platform.openai.com/account/billing). O cambiar a modo `classic` que no requiere OpenAI.

### 6. `Webhook verification failed`
**Causa:** El `WHATSAPP_VERIFY_TOKEN` del `.env` no coincide con el configurado en Meta.
**Solución:** Verificar que ambos valores sean idénticos.

### 7. `Invalid signature` / `403 Forbidden` en el webhook
**Causa:** El `APP_SECRET` no coincide con el de la aplicación de Meta.
**Solución:** Copiar el App Secret exacto desde Meta → App Settings → Basic.

### 8. `Error: Cannot find module 'pdf-parse-fork'`
**Causa:** Dependencias no instaladas correctamente.
**Solución:** Eliminar `node_modules` y ejecutar `npm install` de nuevo.

### 9. `Zod validation error` al arrancar
**Causa:** Alguna variable de entorno tiene un formato inválido (ej: `APP_BASE_URL` sin `http://`).
**Solución:** Verificar que `APP_BASE_URL` tenga el formato `https://dominio.com`.

### 10. Panel en blanco sin estilos
**Causa:** Las vistas Handlebars no se encuentran.
**Solución:** Verificar que la carpeta `views/` esté en la raíz del proyecto (junto a `src/`). En producción, asegurarse de que `views/` se copie al directorio de despliegue.

## Arquitectura

```
src/
├── config/              # Validación de env y configuración
├── common/
│   ├── filters/         # Global exception filter
│   ├── guards/          # Onboarding guard
│   └── helpers/         # text-processor, vector-math, time-validator
└── modules/
    ├── database/        # Drizzle ORM + 16 schemas MySQL
    ├── encryption/      # AES-256-CBC para credenciales
    ├── storage/         # Cloudflare R2 (S3 compatible)
    ├── credentials/     # Gestión segura de API keys
    ├── whatsapp/        # API de WhatsApp Business
    ├── openai/          # GPT, Whisper, Embeddings, Tool Calling
    ├── conversation/    # Conversaciones + mensajes
    ├── rag/             # RAG: embeddings, chunking, vector search
    ├── documents/       # Upload, extracción de texto, indexación
    ├── calendar/        # Google Calendar (AI flow + classic flow)
    ├── classic-bot/     # Modo clásico: nodos, opciones, flujos
    ├── onboarding/      # Wizard de configuración inicial
    ├── queue/           # BullMQ + Bull Board
    ├── webhook/         # Webhook controller + processor
    └── panel/           # Panel admin (API + vistas Handlebars)
```
