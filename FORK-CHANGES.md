# Fork ChatbotX — Cambios necesarios

> Rama base: `main` de [github.com/chatbotxio/chatbotx](https://github.com/chatbotxio/chatbotx)

---

## 🔧 Parches actuales (ya resueltos, ahora nativos)

Estos cambios ya los tenemos funcionando con parches en runtime. Ahora se hacen directo en el source.

### 1. Realtime auth — usar `REALTIME_AUTH_URL`

**Archivo**: `apps/realtime/src/lib/auth.ts`  
**Cambio**: Línea ~35, reemplazar detección por `origin` header con `process.env.REALTIME_AUTH_URL`  
**Patch actual**: `patch-auth.sh`

### 2. Realtime server — redirect de `/ws/parties/*` → `/parties/*`

**Archivo**: `apps/realtime/src/lib/server.ts`  
**Cambio**: Agregar fallback redirect (nginx ya hace el strip, esto es backup)  
**Patch actual**: `patch-server.sh`

### 3. Desbloquear edición enterprise (sin límites community)

**Archivo**: raíz del proyecto (donde se define `isCommunity()`)  
**Cambio**: Forzar `isCommunity() = false` para que la edición enterprise funcione sin restricciones  
**Patch actual**: `Dockerfile.fibrazo`

### 4. Host binding

**Archivo**: `Dockerfile` del builder  
**Cambio**: Agregar `HOST=0.0.0.0` para que Next.js escuche en todas las interfaces  
**Actual**: En `docker-compose.yml` como variable de entorno

### 5. Healthcheck del builder

**Archivo**: `docker-compose.yml` (o `Dockerfile` para healthcheck nativo)  
**Cambio**: Usar `node -e "require('os').hostname()"` en vez de `curl`  
**Actual**: En `docker-compose.yml`

---

## 🐛 Bugs bloqueantes (requieren desarrollo)

### 6. Broadcast de mensajes en tiempo real para Telegram

**Problema**: Cuando llega un mensaje por Telegram, el worker no emite `broadcastToWorkspaceParty`. El Shared Inbox no se actualiza hasta refresh manual.

**Archivos**:
- `integrations/telegram/src/` — handler de incoming messages
- `apps/worker/src/` — donde se procesa el mensaje y debería hacer broadcast

**Qué hacer**: Agregar llamada a `broadcastToWorkspaceParty(workspaceId, event)` en el flujo de recepción de mensajes de Telegram.

**Complejidad**: Media (~1-2 días)

### 7. Auto-skip con timeout para todos los canales

**Problema**: El `autoSkip` configurado en `Get User Data` no funciona en Telegram. El timeout no se dispara porque depende del canal.

**Archivos**:
- `packages/variables/` o `apps/worker/src/` — donde se maneja el `waitForContactInput`
- `integrations/telegram/` — handler de Telegram

**Qué hacer**: Implementar el timeout server-side con BullMQ delayed jobs, independiente del canal. Después de X segundos de inactividad, el flow continúa automáticamente.

**Complejidad**: Alta (~2-3 días)

### 8. `CancelContactInput` — implementar

**Problema**: Listado en el código como step type pero implementación vacía (`void 0`). No aparece en la UI del flow builder.

**Archivos**: `apps/builder/`, `apps/worker/`, packages de flow execution

**Complejidad**: Alta (~3-5 días)

### 9. `WaitUserReply` — implementar

**Problema**: Igual que arriba. Declarado pero sin implementar.

**Complejidad**: Alta (~3-5 días)

---

## ✨ Features nuevas (deseables)

### 10. Variables globales de workspace

**Problema**: No hay constantes tipo `{{env.URL_API}}` ni variables configurables por workspace. Las URLs se hardcodean en cada nodo.

**Archivos**:
- `packages/database/` — nueva tabla `workspace_variable` (workspaceId, key, value)
- `packages/variables/src/` — nuevo resolver para `{{workspace.XXX}}` o `{{env.XXX}}`
- `apps/builder/` — UI en workspace settings para definir variables

**Complejidad**: Media (~2-3 días)

### 11. Migrar flows entre workspaces

**Problema**: No hay UI ni API para copiar un flow de Dev a Prod.

**Archivos**:
- `apps/builder/` — botón "Copy to workspace" en flow list
- API endpoint de export/import con regeneración de IDs

**Complejidad**: Media-Alta (~3-5 días)

### 12. Keyword para resetear conversación (ya funciona parcialmente)

**Problema**: La keyword `reiniciar` existe pero no siempre resetea bien el estado.

**Archivos**: `apps/worker/src/`, handlers de flow execution

**Qué hacer**: Verificar que el reset de estado del flow funcione y que el contacto pueda empezar de cero.

**Complejidad**: Baja (~1 día)

---

## 📋 Prioridades

| # | Cambio | Urgencia | Motivo |
|---|---|---|---|
| 1-5 | Parches a nativos | 🔴 YA | Dejar de depender de parches |
| 12 | Reset de conversación | 🔴 YA | Workaround para loop infinito |
| 10 | Variables globales | 🟠 Alta | Evitar hardcodear URLs en todos los flows |
| 6 | Broadcast Telegram | 🟠 Alta | Shared Inbox usable sin refresh |
| 7 | Auto-skip timeout | 🟡 Media | Flows con Get User Data no se traban |
| 11 | Migrar flows | 🟡 Media | Pasar de Dev a Prod sin script SQL |
| 8-9 | CancelContactInput / WaitUserReply | 🟢 Baja | Nice to have |

---

## 🏗️ Estructura del proyecto

```
chatbotx-source/
├── apps/
│   ├── builder/       # Next.js — UI + API
│   ├── worker/        # BullMQ workers — ejecuta flows
│   ├── realtime/      # PartyKit — WebSocket
│   └── cli/           # CLI tool
├── packages/
│   ├── database/      # Drizzle ORM schema
│   ├── variables/     # Motor de {{variables}}
│   ├── business/      # Lógica de negocio
│   └── ...
├── integrations/
│   ├── telegram/      # Handler de Telegram
│   ├── whatsapp/      # Handler de WhatsApp
│   └── ...
└── docker-compose.yml
```

## 🛠️ Build y test

```bash
cd chatbotx-source
pnpm install
pnpm build              # build completo con Turborepo
pnpm --filter builder dev   # solo el builder en dev
pnpm --filter worker dev    # solo el worker en dev
```
