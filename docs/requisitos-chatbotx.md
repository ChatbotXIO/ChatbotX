# ChatbotX — Requisitos, Arquitectura y Conectividad

> Documento de referencia para despliegue y conectividad de ChatbotX.
> Cubre: infraestructura (servidores), conexión de WhatsApp, datos (data),
> conversación, y métricas.

---

## 1. Resumen del producto

ChatbotX es una plataforma **omnicanal** de chatbots que unifica en un solo
inbox la atención por múltiples canales: **WhatsApp, Telegram, Messenger,
Instagram, Zalo, TikTok, Webchat y Email**. Incluye constructor visual de
flujos, agentes de IA, respuestas automáticas, broadcasts, webhooks, API
pública, CLI y MCP.

---

## 2. Requisitos de infraestructura (servidores)

### 2.1 Componentes de la aplicación

| Componente | Rol | Puerto |
|---|---|---|
| `builder` | Web app (Next.js 16) — UI + API | 3123 |
| `worker` | Procesos en background (BullMQ) — chat, IA, triggers, webhooks, secuencias | — |
| `realtime` | Servidor de tiempo real (PartyKit/WebSocket) | 1999 |
| `cli` | Cliente de línea de comandos | — |
| `mcp-server` | Servidor MCP sobre la API pública | — |

### 2.2 Servicios de datos / infraestructura (Docker Compose)

| Servicio | Imagen / tech | Puerto | Para qué |
|---|---|---|---|
| PostgreSQL | `timescale/timescaledb-ha:pg18-all` | 5432 (ó 5433) | Base principal + **pgvector** (embeddings IA) + timescale |
| Redis | `redis:8-alpine` | 6379 (ó 6380) | Colas BullMQ + caché |
| Object Storage | `rustfs/rustfs` (S3-compatible) | 9000 / 9001 | Archivos/adjuntos (fotos, audios, docs) |
| Adminer | `adminer:latest` | 8080 | UI de base de datos (opcional) |
| MailHog | `mailhog/mailhog` | 8025 | Pruebas de email (opcional) |

### 2.3 Requisitos mínimos / recomendados

> Estimaciones basadas en ejecución en dev. Ajustar según volumen de
> mensajes, canales y agentes de IA.

| Recurso | Mínimo | Recomendado |
|---|---|---|
| **RAM** | 8 GB | 16 GB |
| **CPU** | 4 vCPU | 8 vCPU |
| **Disco** | 40 GB SSD | 100 GB+ SSD (crece con adjuntos) |

**Referencia de consumo real (dev, 1 workspace con Telegram + WhatsApp):**

| Proceso | RAM aprox. |
|---|---|
| `builder` (Next.js + Turbopack) | 3–5 GB |
| `worker` (11 consumidores) | ~1 GB |
| PostgreSQL + Redis + S3 | ~0.5 GB |
| `realtime` | ~0.2 GB |

> El builder es el mayor consumidor. En producción (`next build` + `next start`)
> el footprint es menor que en dev (Turbopack), pero conviene dimensionar 2 GB+
> solo para el builder.

### 2.4 Stack tecnológico

- **TypeScript 5**, **React 19**, **Next.js 16** (App Router)
- **Drizzle ORM** + **PostgreSQL** (con **pgvector**)
- **Redis** + **BullMQ** para colas; **Kafka** para despacho de secuencias a alta escala
- **S3-compatible** storage
- **Better Auth** (autenticación), **oRPC** (API/OpenAPI)
- **pnpm** + **Turborepo** (monorepo), **Node.js >= 24**

### 2.5 Túnel / dominio público (webhooks)

Los canales (WhatsApp/Meta, Telegram, TikTok…) envían **webhooks** a una URL
pública. Se requiere un dominio/túnel estable y HTTPS:

- `NEXT_PUBLIC_BROKER_URL` — host público de los webhooks (debe ser fijo, no
  efímero como ngrok free).
- Recomendado: **cloudflared** o un dominio con TLS (o ngrok pago con dominio fijo).

---

## 3. Requisitos para conectar WhatsApp

Para conectar un número de WhatsApp se usa la **WhatsApp Business API (Meta)**,
no la app normal de WhatsApp. Se necesita de Meta/Facebook:

### 3.1 Checklist de lo que hay que tener

1. **Cuenta de Meta Business** (Business Manager).
2. **App de desarrollador de Meta** con el producto **WhatsApp** habilitado.
3. **App ID** y **App Secret** (son las credenciales de plataforma
   `clientId` / `clientSecret`).
4. **Cuenta de WhatsApp Business (WABA)** creada dentro de la app.
5. **Número de teléfono de WhatsApp** dedicado al bot:
   - No puede estar registrado en una cuenta personal de WhatsApp.
   - Requiere verificación y un **display name** aprobado.
6. **System User de Meta** con acceso al WABA y al número (para el flujo OAuth2
   / token de acceso).
7. **Webhook callback URL** (la URL pública de ChatbotX) + **verify token**
   para validar suscripción.

### 3.2 Datos que se obtienen al conectar

- `wabaId` (ID del WhatsApp Business Account)
- `businessId` (ID del Business Manager)
- `phoneNumberId` (ID del número)
- `accessToken` (token OAuth2 del system user)
- `webhookUrl` (URL de callback registrada)

### 3.3 Flujo de conexión (alto nivel)

1. Registrar credenciales de plataforma (App ID / App Secret / system user).
2. Flujo de autorización OAuth2 (embedded signup de Meta).
3. Seleccionar el WABA y el número a conectar.
4. Verificar el número y el webhook.
5. ChatbotX queda suscrito a los eventos del número.

---

## 4. Data (qué datos se manejan y almacenan)

### 4.1 Entidades principales

| Entidad | Contenido |
|---|---|
| **Workspace** | Espacio de trabajo (organización/cliente) con su `tenantId`. |
| **Contact** | Persona que escribe: nombre, teléfono, email, locale, timezone, avatar. |
| **ContactInbox** | Relación contacto ↔ canal/inbox (sourceId del canal, estado). |
| **Conversation** | Hilo de mensajes entre contacto e inbox; estado, asignado a agente/equipo. |
| **Message** | Cada mensaje: texto, tipo de contenido, adjuntos, remitente, timestamps. |
| **Inbox** | Canal conectado (whatsapp, telegram, messenger…). |
| **Integration** | Credenciales/auth del canal por workspace. |
| **Flow** | Flujo de conversación (nodos/pasos) construido en el builder. |
| **Analytics events** | Eventos de mensajes y de respuestas del bot (ver §7). |

### 4.2 Notas de datos

- **Búsqueda vectorial**: los embeddings para IA/RAG se guardan en PostgreSQL
  con **pgvector**.
- **Adjuntos**: fotos/audios/documentos se suben al storage S3-compatible; en
  la base solo se guarda la ruta (`originPath`).
- **Aislamiento multi-tenant**: cada `User`/`Workspace` lleva un `tenantId`
  (por defecto el raíz). El email del usuario es único **por tenant**, no global.
- **Privacidad/seguridad**: revisar `docs/tenancy.md` y la checklist de
  seguridad (`.agents/skills/security-review`) antes de exponer datos sensibles.

---

## 5. Conversación (cómo funciona)

### 5.1 Canales soportados

WhatsApp, Telegram, Messenger, Instagram (DM + comentarios), Zalo, TikTok,
Webchat y Email. Cada canal es una integración bajo `integrations/<canal>`.

### 5.2 Ciclo de un mensaje entrante

```
Canal → webhook → builder (ruta pública) → cola BullMQ → worker
     → guardar mensaje + contacto/conversación → broadcast tiempo real → UI
     → routing (flujo / respuesta automática / agente de IA) → respuesta al canal
```

### 5.3 Herramientas de conversación

- **Inbox compartido**: bandeja unificada multiagente con asignación a usuarios/equipos.
- **Flow builder**: flujos visuales con nodos (enviar mensaje, pedir datos,
  condiciones, IA, webhooks, etc.).
- **Agentes de IA**: respuestas generadas por IA (OpenAI, Claude, Gemini,
  DeepSeek, etc.) con contexto del contacto.
- **Respuestas automáticas**: por palabras clave (keywords).
- **Broadcasts y secuencias**: mensajes masivos y campañas programadas.

---

## 6. Infraestructura (detalle de componentes)

- **Monorepo pnpm + Turborepo**: `apps/*` (producto) y `packages/*` (librerías
  compartidas: `database`, `business`, `ui`, `sdk`, `worker-config`, `ai`, …).
- **Colas (BullMQ/Redis)**: jobs de chat, IA, triggers, webhooks, analytics,
  secuencias.
- **Realtime**: servidor WebSocket (PartyKit) para actualización en vivo del inbox.
- **Escalado**: el `worker` y el `builder` se pueden escalar por separado;
  las colas permiten añadir más consumidores según carga.
- **Despliegue**: Docker Compose para los servicios de datos; el builder en
  producción usa `next build` + `next start`.

---

## 7. Métricas

### 7.1 Qué se mide

| Área | Métricas / eventos |
|---|---|
| **Mensajes** | eventos de mensaje enviado/recibido (`AnalyticsMessageEvent`). |
| **Respuestas del bot** | eventos de respuesta del bot (`AnalyticsBotMessageEvent`): tipo de ruta, proveedor de IA, latencia, si hubo respuesta o fallback. |
| **Contactos** | contactos nuevos (`contact:created`), fuente (ads, enlace, comentario…). |
| **MAC** | Contactos activos mensuales (base del billing/cuota). |
| **Dashboard** | eventos `analytics:dashboard` agregados por workspace. |

### 7.2 Notas de métricas

- Los eventos se emiten por un **event bus** interno (`@chatbotx.io/event-bus`)
  y se persisten en tablas de analytics.
- La **cuota/billing** se apoya en el `UserQuota` del owner (ver `docs/tenancy.md`),
  con el **MAC** como métrica de contacto mensual.
- Para reportes personalizados se puede consultar las tablas de analytics o
  exponerlas vía la **API pública** (`packages/public-apis`).

---

## 8. Requisitos para desplegar en AWS

### 8.1 Arquitectura (alto nivel)

```
Route 53 (dominio) → ACM (TLS) → ALB
   ├── / (web)          → builder (ECS Fargate)
   ├── /realtime (WS)   → realtime (ECS Fargate)
   └── webhooks / API   → builder (rutas públicas)
worker (ECS Fargate) → colas (ElastiCache Redis)
builder/worker → PostgreSQL TimescaleDB+pgvector · S3 · Secrets Manager
```

### 8.2 Mapeo: componente local → servicio AWS

| Local (Docker Compose) | Servicio AWS |
|---|---|
| `builder` (Next.js 16) | ECS Fargate (o EC2/EKS) detrás de ALB |
| `worker` (BullMQ) | ECS Fargate (task long-running) |
| `realtime` (WebSocket) | ECS Fargate (ALB con WebSocket) |
| PostgreSQL (timescale + pgvector) | EC2 auto-gestionado o Timescale Cloud (ver 8.4) |
| Redis | ElastiCache for Redis |
| `rustfs` (S3-compatible) | S3 |
| MailHog | SES (opcional) |
| Adminer | — (no va a producción) |

### 8.3 Compute (contenedores)

- **ECS Fargate** recomendado (serverless, sin gestionar nodos). **EKS** si ya usan Kubernetes.
- Tres servicios separados: `builder`, `worker`, `realtime`.
- Imágenes en **ECR**; el `builder` se corre como `next build` + `next start` (output standalone).
- **No usar Lambda / Amplify**: el `worker` es un proceso BullMQ long-running, el `realtime` mantiene WebSockets persistentes y el `builder` es un servidor Node standalone.
- Escalar `worker` y `builder` por separado según la carga de colas.

### 8.4 Base de datos (punto crítico)

- Se requieren **TimescaleDB** (sharding de `Message`/`Attachment` con hypertables
  de 7 días + compresión a 30 días) y **pgvector** (embeddings de IA).
- ⚠️ **RDS PostgreSQL y Aurora PostgreSQL NO soportan TimescaleDB.**
- Opciones:
  1. **EC2 con PostgreSQL 18 + TimescaleDB + pgvector** — réplica del setup local,
     imagen `timescale/timescaledb-ha:pg18-all`.
  2. **Timescale Cloud** (SaaS) o vía AWS Marketplace.
  3. **RDS/Aurora PostgreSQL** solo si se elimina el sharding TimescaleDB
     (cambio de código, no recomendado); en ese caso `pgvector` sí está soportado.

### 8.5 Redis (colas + caché)

- **ElastiCache for Redis** (engine compatible con BullMQ).
- BullMQ usa listas/streams y locks distribuidos; usar Redis clúster estándar
  (evitar serverless si se depende de `EVAL`/locks).
- `REDIS_URL` apunta al endpoint de ElastiCache.
- Nota: si hay errores de red por IPv6, arrancar el worker con
  `NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection'`.

### 8.6 Storage (S3)

- Bucket **S3** para adjuntos (fotos, audios, documentos); la base solo guarda la ruta (`originPath`).
- Configurar `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` y `S3_ENDPOINT`.
- Reemplaza a `rustfs`; el código usa la API S3 estándar (endpoint configurable).

### 8.7 Red y dominio (webhooks)

- **VPC**: subnets públicas (ALB) y privadas (ECS, RDS, Redis).
- **ALB** con listener HTTPS (certificado **ACM**) y soporte **WebSocket** para `realtime`.
- **Route 53**: dominio fijo + certificado ACM — **obligatorio** porque los canales
  (WhatsApp/Meta, Telegram, TikTok…) envían webhooks a una URL pública estable.
- **Security Groups**:

  | Origen | Destino | Puerto |
  |---|---|---|
  | ALB | ECS (builder/realtime) | 3123, 1999 |
  | ECS | Postgres | 5432 |
  | ECS | ElastiCache | 6379 |
  | ECS | S3 | VPC endpoint / gateway |

- `NEXT_PUBLIC_BROKER_URL` debe apuntar al dominio público (no efímero).

### 8.8 Imágenes y secretos

- **ECR** para las imágenes (`builder`, `worker`, `realtime`).
- **Secrets Manager** (o SSM Parameter Store) para: `BETTER_AUTH_SECRET`,
  `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, claves S3, `REALTIME_BROADCAST_SECRET`,
  credenciales de canales y proveedores de IA.

### 8.9 Variables de entorno mínimas

| Variable | Valor en AWS |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (TimescaleDB + pgvector) |
| `REDIS_URL` | Endpoint de ElastiCache |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciales IAM con acceso al bucket |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` | Bucket S3 y región |
| `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` | Secretos (Secrets Manager) |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_BUILDER_URL` | Dominio del builder |
| `NEXT_PUBLIC_BROKER_URL` | Dominio público de webhooks (fijo) |
| `REALTIME_BROADCAST_SECRET` | Secreto compartido con realtime |
| `SMTP_SERVER` / `SMTP_FROM` | SES (opcional) |
| `NEXT_PUBLIC_EDITION` | `community` (o `enterprise`) |

### 8.10 Opcionales (escala / producción)

- **MSK** (Kafka) para despacho de secuencias a alta escala.
- **CloudFront + WAF** delante del ALB (CDN + protección).
- **SES** para email transaccional.
- **CloudWatch** (logs/métricas) + **X-Ray** (tracing) + alarmas.
- **Backups**: snapshots de Postgres, versionado en S3 y backups de ElastiCache.

### 8.11 Dimensionamiento sugerido

| Entorno | builder | worker | Postgres | Redis | Notas |
|---|---|---|---|---|---|
| **Dev/QA** | 1 × 1 vCPU / 2 GB | 1 × 1 vCPU / 2 GB | db.t4g.small | cache.t4g.micro | suficiente para pruebas |
| **Producción (chico)** | 2 × 1 vCPU / 2 GB | 2 × 1 vCPU / 2 GB | db.t4g.medium | cache.t4g.small | 1–5 workspaces |
| **Producción (medio)** | 2–4 × 2 vCPU / 4 GB | 2–4 × 2 vCPU / 4 GB | db.r6g.large (o EC2 8 GB) | cache.m6g.large | 10–50 workspaces |
| **Producción (grande)** | 4+ × 4 vCPU / 8 GB | 4+ × 4 vCPU / 8 GB | EC2 16 GB+ (TimescaleDB) | cache.m6g.xlarge | sharding multi-DB |

> El dimensionamiento de Postgres con TimescaleDB se hace sobre **EC2** (o Timescale
> Cloud), no sobre RDS/Aurora (ver 8.4). Ajustar discos según volumen de mensajes
> y adjuntos (la compresión a 30 días reduce el crecimiento).


### 8.12 Checklist completo para levantar en AWS (lista de compra)

#### Opción de servidor (elegí una)

**Opción A — 1 solo servidor (todo en uno), recomendada para arrancar**

Levantás todo con Docker Compose en un solo EC2 (es el mismo `docker-compose.yml`
que ya usás local, con el builder compilado). Es lo más rápido para poner el
chatbot andando y validar; después podés migrar a la opción B.

| Recurso | Característica |
|---|---|
| Instancia EC2 | `t3.xlarge` (4 vCPU / 16 GB) — o `m6i.xlarge` si querés más estabilidad para producción |
| Disco (EBS) | 100 GB **gp3** SSD (ampliable) |
| SO | Ubuntu 24.04 LTS (o Amazon Linux 2023) |
| Red | **Elastic IP** (fija) |
| Software | Docker + Docker Compose (builder, worker, realtime, TimescaleDB, Redis, MinIO o S3) |
| Security Group | 22 SSH (solo tu IP), 80 y 443 abiertos |

> Mínimo real: **4 vCPU / 16 GB RAM / 100 GB SSD**. No bajes de 8 GB RAM porque
> el builder (Next.js) solo consume 2–4 GB y el Postgres + Redis + worker suman.
> Para más workspaces, subí a `m6i.2xlarge` (8 vCPU / 32 GB).

**Opción B — ECS Fargate (escalable, gestionado)**

| Componente | Tamaño sugerido |
|---|---|
| `builder` (Next.js) | 2 × 2 vCPU / 4 GB |
| `worker` (BullMQ) | 2 × 2 vCPU / 4 GB |
| `realtime` (WebSocket) | 1–2 × 1 vCPU / 2 GB |
| Postgres (TimescaleDB) | EC2 `m6i.xlarge` 8 GB+ (o Timescale Cloud) |
| Redis | ElastiCache `cache.m6g.large` |
| Balanceador | ALB + 2 target groups (web + realtime) |

---

#### Lista de recursos a crear (de punta a punta)

1. **Cuenta AWS** — una cuenta con billing activo y permisos de administrador.
2. **Región** — elegir una (ej. `us-east-1`); crear todo en la misma región.
3. **Usuario IAM de despliegue** — con permisos limitados (ECR, ECS, S3, Secrets Manager) para CI/CD; no usar el usuario root.
4. **Dominio** — registrar/comprar un dominio (Route 53 o un registrador externo) o usar un subdominio de uno existente. Ej: `chatbotx.tudominio.com`.
   - **Hosted zone** en Route 53.
   - **Certificado ACM** para el dominio (y `*.tudominio.com` si usás subdominios para realtime).
5. **VPC** (opción B) — con subnets públicas (ALB) y privadas (ECS/Postgres/Redis) + Internet Gateway + NAT Gateway.
6. **Servidor compute** — la instancia EC2 (opción A) o el cluster ECS Fargate (opción B).
7. **Base de datos** — PostgreSQL 18 con **TimescaleDB + pgvector**:
   - Opción A: dentro del mismo EC2 (contenedor `timescale/timescaledb-ha:pg18-all`).
   - Opción B: EC2 dedicado o **Timescale Cloud** (⚠️ RDS/Aurora NO sirven, ver 8.4).
8. **Redis** — opción A: contenedor en el EC2; opción B: **ElastiCache for Redis**.
9. **S3** — 1 bucket privado para adjuntos (`chatbotx-<workspace>`), con credenciales IAM dedicadas.
10. **Entrada pública / balanceador**:
    - Opción A: nginx/caddy en el EC2 (o un ALB delante) terminando TLS con el certificado ACM.
    - Opción B: **ALB** + target groups (`builder:3123`, `realtime:1999`) con listener HTTPS.
11. **ECR** (opción B) — repositorios para las imágenes `builder`, `worker`, `realtime`.
12. **Secrets Manager** — secretos: `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, claves S3, `REALTIME_BROADCAST_SECRET`.
13. **SES** (opcional) — verificar el dominio para email transaccional (reemplaza MailHog).
14. **CloudWatch** — log groups para builder/worker/realtime + alarmas (CPU, errores, cola).
15. **Backups** — snapshots/AMIs del EC2 (o snapshots de Postgres), versionado en S3.

#### Dominios / URLs finales (lo que hay que configurar en el `.env`)

| URL | Qué es |
|---|---|
| `https://app.tudominio.com` | builder (`NEXT_PUBLIC_BUILDER_URL` + `BETTER_AUTH_URL`) |
| `https://app.tudominio.com` (o `/api/...`) | webhooks públicos (`NEXT_PUBLIC_BROKER_URL`) — **debe ser fija y pública** |
| `https://realtime.tudominio.com` | realtime (`NEXT_PUBLIC_REALTIME_URL`) |

#### Costo mensual estimado (orden de magnitud, us-east-1)

| Recurso | Costo aprox. |
|---|---|
| EC2 `t3.xlarge` (opción A) | ~ USD 120–140 |
| ECS Fargate (opción B, 3 servicios) | ~ USD 150–300 |
| ElastiCache `cache.m6g.large` | ~ USD 60 |
| Timescale Cloud (base chica) | ~ USD 50–150 |
| S3 + tráfico | ~ USD 10–50 |
| Route 53 + ACM | ~ USD 0.5–1 (dominio aparte, ~ USD 10–15/año) |
| **Total opción A (todo en 1 servidor)** | **~ USD 130–160/mes** |
| **Total opción B (gestionado)** | **~ USD 300–600/mes** |

> Estos son valores de referencia; dependen de la región, el tráfico y el plan de
> ahorro (reserved/Savings Plans). Para arrancar, la opción A es la más barata y simple.

---
## 9. Resumen ejecutivo (una página)

- **Qué es**: plataforma omnicanal de chatbots (WhatsApp, Telegram, IG, webchat…).
- **Qué servidores necesita**: 1 builder (Next.js), 1 worker (BullMQ), 1 realtime,
  + PostgreSQL (pgvector), Redis y S3-compatible. **8 GB RAM mín, 16 GB recomendado**.
- **Qué se necesita de WhatsApp**: Meta Business + App con WhatsApp + WABA +
  número dedicado + system user + App ID/Secret + webhook URL con HTTPS.
- **Data**: contactos, mensajes, conversaciones, integraciones, flujos y eventos de analytics.
- **Métricas**: mensajes, respuestas del bot, contactos (MAC) y dashboard por workspace.
- **En AWS**: ECS Fargate (builder/worker/realtime) + ElastiCache + S3; base con
  TimescaleDB sobre EC2 o Timescale Cloud (RDS/Aurora NO soportan TimescaleDB).
