# ChatbotX — Documento de Presentación

> Guía para la presentación: qué es, qué datos maneja, cómo funciona la
> conversación, qué infraestructura necesita, qué métricas y analíticas expone,
> y cobertura de lo pedido (Jesús).

---

## 1. Resumen ejecutivo

ChatbotX es una **plataforma omnicanal de chatbots** que unifica en un solo
inbox la atención por **WhatsApp, Telegram, Messenger, Instagram, Zalo, TikTok,
Webchat y Email**.

Incluye:
- **Inbox compartido** multiagente (con roles: administradores y asesores).
- **Flow builder** visual (constructor de flujos de conversación).
- **Agentes de IA** (OpenAI, Claude, Gemini, DeepSeek, etc.).
- **Respuestas automáticas** por palabras clave.
- **Broadcasts y secuencias** (mensajes masivos y campañas).
- **Webhooks + API pública + CLI + MCP** para integrar con sistemas externos.

---

## 2. Data (qué datos se manejan y almacenan)

### 2.1 Entidades principales

| Entidad | Qué guarda |
|---|---|
| **Workspace** | El "negocio/bot" (organización). Lleva `tenantId` (aislamiento multi-tenant). |
| **User** | Cuenta de una persona (email único **por tenant**). |
| **WorkspaceMember** | Rol y permisos de cada usuario en el workspace (`owner` / `agent`). |
| **Contact** | Persona que escribe: nombre, teléfono, email, locale, timezone, avatar. |
| **ContactInbox** | Relación contacto ↔ canal (sourceId del canal, estado). |
| **Conversation** | Hilo de mensajes; estado, asignado a agente/equipo, pasos del flujo. |
| **Message** | Cada mensaje: texto, tipo de contenido, adjuntos, remitente, timestamps. |
| **Inbox** | Canal conectado (whatsapp, telegram, messenger…). |
| **Integration** | Credenciales/auth del canal por workspace. |
| **Flow** | Flujo de conversación (nodos/pasos). |
| **CustomField** | Campos personalizados por contacto (texto, número, booleano, longText). |
| **Analytics** | Eventos de mensajes y de respuestas del bot (ver §5 y §6). |

### 2.2 Notas de datos

- **Búsqueda vectorial**: embeddings para IA/RAG en PostgreSQL con **pgvector**.
- **Adjuntos**: fotos/audios/documentos se suben a storage **S3-compatible**; en
  la base solo se guarda la ruta (`originPath`).
- **Multi-tenant**: `User`/`Workspace` llevan `tenantId`; el email es único por
  tenant (no global).
- **Roles y permisos**: 2 roles (`owner` = admin, `agent` = asesor) + permisos
  granulares (`superAdmin`, `flows`, `contacts`, `onlyAssignedContacts`,
  `analytics`, `broadcast`, `ecommerce`, `emailAndPhone`).

---

## 3. Conversación (cómo funciona)

### 3.1 Canales soportados

WhatsApp, Telegram, Messenger, Instagram (DM + comentarios), Zalo, TikTok,
Webchat y Email.

### 3.2 Ciclo de un mensaje entrante

```
Canal → webhook → builder (ruta pública) → cola BullMQ → worker
     → guardar mensaje + contacto/conversación → broadcast tiempo real → UI
     → routing (flujo / palabras clave / agente de IA) → respuesta al canal
```

### 3.3 Herramientas de conversación

- **Inbox compartido**: bandeja unificada multiagente, con asignación a
  usuarios/equipos y transferencia bot ↔ humano.
- **Flow builder**: flujos visuales con nodos (enviar mensaje, botones/quick
  replies, pedir datos, condiciones, IA, webhooks, etc.).
- **Agentes de IA**: respuestas generadas por IA con contexto del contacto.
- **Palabras clave (keywords)**: respuestas automáticas por coincidencia.
- **Broadcasts y secuencias**: mensajes masivos y campañas programadas.

### 3.4 Roles en la operación

| Rol | Qué puede hacer |
|---|---|
| **owner (admin)** | Todo: config, flujos, usuarios, métricas. |
| **agent (asesor)** | Atender conversaciones (solo lo asignado, si se configura). |

---

## 4. Infraestructura (especificaciones del server)

### 4.1 Componentes de la aplicación

| Componente | Rol | Puerto |
|---|---|---|
| `builder` | Web app (Next.js 16) — UI + API | 3123 |
| `worker` | Procesos en background (BullMQ): chat, IA, triggers, webhooks, secuencias | — |
| `realtime` | Servidor de tiempo real (WebSocket/PartyKit) | 1999 |
| `cli` / `mcp-server` | Cliente CLI y servidor MCP (opcional) | — |

### 4.2 Servicios de datos

| Servicio | Tech / imagen | Puerto | Para qué |
|---|---|---|---|
| PostgreSQL | `timescale/timescaledb-ha:pg18-all` | 5432 | Base principal + **pgvector** + timescale |
| Redis | `redis:8-alpine` | 6379 | Colas BullMQ + caché |
| Object Storage | `rustfs/rustfs` (S3-compatible) | 9000 | Archivos/adjuntos |
| (opcional) | Adminer, MailHog | 8080 / 8025 | Admin DB / test email |

### 4.3 Requisitos mínimos / recomendados

| Recurso | Mínimo | Recomendado |
|---|---|---|
| **RAM** | 8 GB | 16 GB |
| **CPU** | 4 vCPU | 8 vCPU |
| **Disco** | 40 GB SSD | 100 GB+ SSD (crece con adjuntos) |

> Referencia real (dev, 1 workspace con Telegram + WhatsApp): builder 3–5 GB,
> worker ~1 GB, Postgres+Redis+S3 ~0.5 GB.

### 4.4 Stack tecnológico

TypeScript 5 · React 19 · Next.js 16 · Drizzle ORM + PostgreSQL (pgvector) ·
Redis + BullMQ · Kafka (secuencias a alta escala) · S3-compatible · Better Auth ·
oRPC (API/OpenAPI) · pnpm + Turborepo · Node.js >= 24.

### 4.5 Conectividad externa (webhooks)

- Los canales (Meta/WhatsApp, Telegram, TikTok…) mandan **webhooks** a una URL
  pública **HTTPS estable** (`NEXT_PUBLIC_BROKER_URL`).
- Recomendado: **cloudflared** o un dominio con TLS (no ngrok free, que cambia URL).

### 4.6 Despliegue en AWS

Requisitos y checklist completos para levantar en AWS (ECS Fargate / EC2,
ElastiCache, S3, RDS vs TimescaleDB, dominio + ACM): ver
`docs/requisitos-chatbotx.md` §8 (y el checklist ejecutable en §8.12).

---

## 5. Métricas (qué se mide)

| Área | Métricas / eventos |
|---|---|
| **Mensajes** | Eventos por mensaje (`AnalyticsMessageEvent`): recibido/enviado, remitente, canal, fuente. |
| **Respuestas del bot** | `AnalyticsBotMessageEvent`: `hasResponse`, `responseType` (flow/agent/fallback), `routeType`, `result`, `aiProvider`. |
| **Contactos** | Contactos nuevos (`contact:created`) con fuente (ads, enlace, comentario…). |
| **MAC** | Contactos activos mensuales (base del billing/cuota). |
| **Dashboard** | Eventos `analytics:dashboard` agregados por workspace. |

### 5.1 Eventos que se emiten (event bus)

`message:received` · `message:sent` · `message:bot_received` · `message:bot_sent`
· `message:failed` · `contact:created` · `analytics:dashboard`.

---

## 6. Analíticas (lo que van a ver mucho)

### 6.1 Tablas de analítica

**`AnalyticsMessageEvent`** (eventos de mensaje):
`eventType, senderType (contact/admin/bot), channel, source, sourceId, adminId, metadata`.

**`AnalyticsBotMessageEvent`** (respuestas del bot):
`hasResponse, responseType (flow|agent|fallback), routeType, result, aiProvider, metadata`.

### 6.2 Qué responde a las preguntas de negocio

- **"¿Cuántos mensajes por canal?"** → `AnalyticsMessageEvent` por `channel`.
- **"¿Cuánto responde el bot vs. un humano?"** → `senderType` + `adminId`.
- **"¿El bot respondió o cayó a fallback?"** → `AnalyticsBotMessageEvent.hasResponse` + `result`.
- **"¿Qué proveedor de IA usó y con qué latencia?"** → `aiProvider` + `metadata.latency`.
- **"¿De dónde vienen los contactos?"** → `contact:created.source`.

### 6.3 Cómo se consumen

- Se emiten por un **event bus** interno (`@chatbotx.io/event-bus`).
- Se persisten en tablas de analytics (PostgreSQL).
- Se pueden consultar por **API pública** (`packages/public-apis`) o desde el
  **dashboard** del builder.

---

## 7. Cobertura (qué pidió Jesús y qué cubrimos)

| Tema pedido | ¿Cubierto? | Dónde |
|---|---|---|
| **Data** (qué datos) | ✅ | §2 (entidades + multi-tenant + pgvector) |
| **Conversación** (cómo funciona) | ✅ | §3 (canales, ciclo, herramientas, roles) |
| **Infraestructura** (specs del server) | ✅ | §4 (componentes, servicios, RAM/CPU/disco, stack) |
| **Métricas** | ✅ | §5 + §6 (eventos, tablas de analítica) |
| **Analíticas** | ✅ | §6 (tablas + preguntas de negocio) |
| **WhatsApp** (qué se necesita) | ✅ | `docs/requisitos-chatbotx.md` §3 (Meta Business, WABA, número, system user, webhook) |

### Pendientes / a confirmar

- **Copia de flujos entre workspaces** (dev → prod) no es nativa (recrear o script).
- **Portal / sub-accounts** (revendedor) requiere SMTP + ser reseller/admin.
- **Túnel estable** para webhooks (hoy ngrok free, recomendado cloudflared).

---

## 8. Posibles preguntas (Q&A)

**Q: ¿Es multi-tenant? ¿Los clientes ven los datos de otros?**
A: Sí, multi-tenant por `tenantId`. Cada workspace está aislado. El email es
único por tenant, no global.

**Q: ¿Qué se necesita para conectar WhatsApp?**
A: Meta Business + App con WhatsApp + WABA + número dedicado + system user +
App ID/Secret + webhook HTTPS. (Ver `docs/requisitos-chatbotx.md` §3.)

**Q: ¿Cuánta RAM/disco necesito?**
A: 8 GB RAM mín / 16 GB recomendado, 4–8 vCPU, SSD. El builder es lo que más come.

**Q: ¿Qué pasa si se cae el servidor? ¿Se pierden mensajes?**
A: El procesamiento usa colas (BullMQ) con reintentos y dedup. El punto frágil es
el webhook: si el servidor está caído, Telegram/Meta reintenta y luego descarta
(monitorear `pending_update_count`).

**Q: ¿Los asesores ven todo o solo lo suyo?**
A: Configurable. El permiso `onlyAssignedContacts` limita a cada asesor a sus
conversaciones asignadas.

**Q: ¿Cómo mido el rendimiento del bot?**
A: `AnalyticsBotMessageEvent`: `hasResponse`, `responseType`, `result`,
`aiProvider`, latencia en `metadata`.

**Q: ¿Puedo tener un ambiente de desarrollo y uno de producción?**
A: Sí, workspaces separados (ej. "Fibi" y "Fibi Dev"), pero son independientes;
no hay copia automática de flujos entre ellos.

**Q: ¿Cómo se crean cuentas para el equipo?**
A: Settings → Administradores → Invitar. Ahí se asigna rol (owner/admin o
agent/asesor) por permisos.

---

## 9. Documentos relacionados

- `docs/requisitos-chatbotx.md` — requisitos de infra + WhatsApp + data + métricas + despliegue en AWS (§8).
- `docs/levantar-chatbotx.md` — runbook de arranque local (ngrok, webhook, etc.).
- `docs/tech-stack.md` — stack técnico.
- `docs/tenancy.md` — modelo de tenencia y cuota.
