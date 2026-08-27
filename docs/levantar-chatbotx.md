# Levantar ChatbotX — runbook local (fork fibrazo/sysbrazo)

> Entorno local de fede. Los puertos están desplazados porque **sysbrazo** (Laravel) ocupa los estándar.
> Esto es lo que hay que hacer cada vez que se cae o "no llegan mensajes de Telegram".

## ⚡ Automático: `scripts/start.sh` (todo en uno)

Hay un script que hace **los pasos 1→6 de una sola vez** (infra + ngrok + `.env` + webhook de Telegram + apps). Es la vía rápida; los pasos manuales de abajo quedan como referencia para debuguear.

```bash
bash scripts/start.sh            # arranca todo (builder ya buildeado, rápido)
bash scripts/start.sh --build    # rebuild del builder y arranca (1ª vez o tras cambios)
bash scripts/start.sh --dev      # builder en modo dev (hot-reload, lento)
```

Qué hace por dentro:

| Paso | Acción |
| --- | --- |
| 1/6 | `docker compose up -d postgres redis filesystem filesystem-init` |
| 2/6 | `ngrok start --all` (si no está corriendo) |
| 3/6 | Lee la URL pública del túnel `chatbotx` desde la API de ngrok (`:4040`) |
| 4/6 | Reescribe `NEXT_PUBLIC_BROKER_URL` en `.env` con esa URL |
| 5/6 | Lee el token + `botId` de `IntegrationTelegram` y registra el webhook de Telegram |
| 6/6 | Levanta `worker` + `realtime` (dev) y el `builder` (dev / prod según el modo) |

Logs:

- Builder: `/tmp/opencode/builder-prod.log` (o `builder-dev.log` en `--dev`)
- Worker: `/tmp/opencode/worker-dev.log`
- Realtime: `/tmp/opencode/realtime-dev.log`

> Requisitos: ngrok ya configurado con el túnel `chatbotx` (sección 3) y el bot de Telegram ya conectado (si no hay fila en `IntegrationTelegram`, saltea el webhook con un warning).

## 0. Arranque desde cero (reinicié el PC — en este orden)

```bash
# 1. Infraestructura
docker compose up -d postgres redis filesystem filesystem-init

# 2. ngrok  (¡la URL VA A CAMBIAR en free!)
ngrok start --all
#    → anotar la URL nueva del túnel "chatbotx"

# 3. Actualizar .env con la URL nueva (y reiniciar el builder después)
#    NEXT_PUBLIC_BROKER_URL=https://<url-nueva>

# 4. Re-registrar el webhook de Telegram (ver sección 4)

# 5. Apps (una terminal por cada una)
pnpm --filter builder dev      # http://localhost:3123
pnpm --filter worker dev
pnpm --filter realtime dev     # http://localhost:1999
```

> **Orden crítico**: infra → ngrok → `.env` → webhook → apps.
> Si reiniciás Docker DESPUÉS de arrancar el builder, reiniciá el builder también
> (se queda con conexiones viejas a Redis → `ECONNREFUSED 6380` → 404).

## 1. Infraestructura

```bash
docker compose up -d postgres redis filesystem filesystem-init
```

Puertos (vienen del `.env`, ya desplazados):

| Servicio     | Puerto chatbotx | Puerto sysbrazo (NO usar) |
| ------------ | --------------- | -------------------------- |
| PostgreSQL   | 5433            | 5432                       |
| Redis        | 6380            | 6379                       |
| S3 (RustFS)  | 9000            | —                          |

## 2. Aplicaciones

```bash
pnpm --filter builder dev      # UI → http://localhost:3123
pnpm --filter worker dev       # 11 consumidores BullMQ (IA, chat, webhooks…)
pnpm --filter realtime dev     # WebSockets → http://localhost:1999
```

> Para no comerte la RAM: NO corras `pnpm dev` a secas (levanta los 12 workspaces).
> Build con límite: `pnpm exec turbo build --concurrency=2` (turbo por defecto lanza 12 tareas en paralelo = pico de RAM).
>
> **Build de producción del builder** (solo ese paquete): `pnpm --filter builder build`.
> La fase de bundling de Next/Turbopack es la que más RAM consume — con la máquina
> llena (Docker + apps de escritorio) puede matarla el OOM killer (exit 137).
> **Build seguro (no congela la UI):** limitar heap + baja prioridad + 4 cores.
> ⚠️ La variable de entorno va SIEMPRE al principio (antes de `nice`/`taskset`):
> `NODE_OPTIONS="--max-old-space-size=4096" nice -n 19 taskset -c 0-3 pnpm --filter builder build`

### Matar las apps (antes de rebuild)

`pkill` acepta un solo patrón por vez, por eso van separados. No matar Docker ni ngrok.

```bash
pkill -f '[n]ext start'      # builder (producción, next start)
pkill -f '[t]sx --watch'     # worker (11 procesos)
pkill -f '[p]artykit dev'    # realtime
```

Verificación (tiene que quedar vacío):

```bash
ps aux | grep -E 'next start|tsx --watch|partykit dev' | grep -v grep
```

> Los corchetes `[n]` evitan que el propio `pkill`/`grep` se maté a sí mismo.
> Si el builder corre con `pnpm dev` (modo dev, no `next start`), matarlo con
> `pkill -f '[n]ext-server'` o `pkill -f '[t]urbopack'` según el proceso.

### Rebuild completo (matar → build → arrancar)

**Obligatorio matar el builder** antes de buildear: el build escribe en `.next` mientras
`next start` lo está leyendo (archivos corruptos). Worker y realtime no leen `.next`,
pero conviene matarlos por RAM. **NUNCA** matar Docker (postgres/redis) ni ngrok.

```bash
# 1. Matar las 3 apps
pkill -f '[n]ext start'
pkill -f '[t]sx --watch'
pkill -f '[p]artykit dev'

# 2. Build seguro (env AL PRINCIPIO; nice + taskset = no congela la UI)
NODE_OPTIONS="--max-old-space-size=4096" nice -n 19 taskset -c 0-3 pnpm --filter builder build

# 3. Arrancar todo (builder, worker, realtime + re-registra webhook de Telegram)
bash scripts/start.sh
```

> Alternativa todo-en-uno (hace build + arranca): `bash scripts/start.sh --build` — pero
> sin el `nice`/`taskset`, así que si la máquina está justa de RAM, mejor por partes.

## 3. ngrok — DOS túneles en UN solo agente

ngrok free permite **un agente** pero **varios túneles**. Definirlos en `~/.config/ngrok/ngrok.yml`:

```yaml
version: "3"
agent:
    authtoken: <TU_AUTHTOKEN>
tunnels:
    sysbrazo:
        proto: http
        addr: http://localhost:8000
        host_header: localhost:8000
    chatbotx:
        proto: http
        addr: http://localhost:3123
        host_header: localhost:3123
```

Levantar (NO `ngrok http ...` suelto, que solo crea un túnel):

```bash
ngrok start --all
```

Ver las URLs públicas:

```bash
curl -s http://127.0.0.1:4040/api/tunnels | python3 -m json.tool
```

## 4. Webhook de Telegram (lo que SIEMPRE se olvida)

El webhook apunta a `<URL ngrok chatbotx>/integrations/telegram/webhook?botId=<botId>`.

Sacar el token del bot y el botId desde la DB:

```bash
docker exec chatbotx-postgres-1 psql -U chatbotx -d chatbotx -c "SELECT \"botId\", auth->>'secretText' AS token FROM \"IntegrationTelegram\";"
```

Registrar el webhook:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://<ngrok-chatbotx>/integrations/telegram/webhook?botId=<botId>"}'
```

Verificar (debe quedar `pending_update_count: 0` y SIN `last_error_message`):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
```

También actualizar `.env`:

```
NEXT_PUBLIC_BROKER_URL=https://<ngrok-chatbotx>
```

## 5. Verificación rápida de que todo funciona

1. `getWebhookInfo` → sin `last_error_message`, `pending_update_count: 0`.
2. DB → aparecen mensajes nuevos:
   ```bash
   docker exec chatbotx-postgres-1 psql -U chatbotx -d chatbotx \
     -c 'SELECT "createdAt", "senderType", left("text",50) FROM "Message" ORDER BY "createdAt" DESC LIMIT 5;'
   ```
3. Realtime (broadcasts del worker llegan con 200):
   ```bash
   tail -f /tmp/opencode/realtime-dev.log   # buscar: POST /parties/workspaces/<id> 200 OK
   ```

## 6. Trampas conocidas

- **ngrok free = URL efímera.** Cada reinicio de ngrok cambia la URL pública → el webhook queda apuntando a una URL muerta → Telegram devuelve `404 Not Found` / `ERR_NGROK_3200`. Solución estable: `cloudflared` o ngrok pago con dominio fijo.
- **`NEXT_PUBLIC_STORAGE_URL`** también es un ngrok y se rompe igual → fotos/archivos de Telegram no cargan. O apuntarlo al túnel nuevo o dejarlo vacío para usar `/storage` local.
- **`FORK-CHANGES.md` #6 está desactualizado**: el broadcast en tiempo real para Telegram YA está implementado (genérico en `apps/worker/src/integration/handlers/received-message.ts` → `saveAndBroadcastMessage`). El "no se ve en tiempo real" casi siempre es consecuencia de que el webhook no llega.
- El worker en dev lanza 11 procesos `tsx --watch` (≈ RAM alta). Si no necesitás todo: `pnpm --filter worker dev:chat`, `dev:ai-agent`, etc.

- **Después de `docker compose stop` / `start`, REINICIAR el builder.** Se queda con conexiones viejas a Redis/DB (`ECONNREFUSED 127.0.0.1:6380`) → el chequeo de sesión falla → `/space/...` y `/auth/...` dan **404**. Reiniciar el builder refresca las conexiones.
- **Los 404 de `/space/...` casi nunca son del workspace**: son sesión expirada o conexiones viejas. El workspace y los datos siguen intactos.
- **Warnings "Base UI" y "script tag" en la consola del navegador**: son ruido cosmético (accesibilidad), no rompen nada. Hard-refresh (Ctrl+Shift+R) para limpiarlos.
## 7. Checklist cuando "no llegan mensajes de Telegram"

1. `getWebhookInfo` → ¿`last_error_message`? → ngrok caído o mal apuntado (pasos 3-4).
2. ¿ngrok apunta a 3123? → `curl http://127.0.0.1:4040/api/tunnels`.
3. ¿El builder está arriba en 3123? → `curl -o /dev/null -w '%{http_code}' http://localhost:3123/integrations/telegram/webhook?botId=<botId>` (debe dar 400, no 404).
4. ¿El worker está arriba? → logs de `/tmp/opencode/worker-dev.log`.

