# PR #2 — Resumen: qué se hizo

**Branch:** `fix/fibrazo-sourceid-license` · **Commit:** `5550e3f13` · **Merge:** `0722c7bde` (PR #2)

## 1. Fix `sourceId` (el 404 de la "Pausa")
**Archivo:** `packages/business/src/contact/service.ts` — `upsertByIdentifier()`

- Se agregó la rama `sourceId` al identificador: ahora busca/crea el contacto por `sourceId` (además de phone/email).
- Guard + mensaje de error claro si no hay ningún identificador.
- **Resultado:** `sourceId: 6644285761` resuelve; sysbrazo `send_message`/`set_custom_fields` devuelven 204; el flujo "Autodiag - Pausa" dispara.

> ⚠️ Ojo: dos contactos (Federico Rampi y Matias Parra) comparten el teléfono `+84350349712`;
> por eso se usa `sourceId` como identificador canónico en esta integración.

## 2. Licencia enterprise: degraded en vez de exit
**Archivo:** `packages/business/src/enterprise/license/startup.ts` — `assertLicenseAtStartup()`

- Antes: sin `LICENSE_KEY` válida → `process.exit(1)` (la app se negaba a arrancar → worker muerto → cola `bull:chat` acumulada).
- Ahora (fork): loguea warning "starting degraded without enterprise features" y **sigue funcionando**.
- **Síntoma que arregló:** worker crasheaba con "Refusing to start" y 12 jobs de chat quedaban en backlog.

## 3. `scripts/start.sh` + runbook
- **`scripts/start.sh`**: arranque todo-en-uno (dependencias, infra, ngrok, webhook, builder, worker, realtime).
  Uso: `bash scripts/start.sh` (rápido) · `--build` (rebuild + arranca) · `--dev` (hot-reload).
- **`docs/levantar-chatbotx.md`**: runbook local completo (infra, ngrok, webhook, verificación, trampas).

## Cómo revertir / re-modificar
- `sourceId`: buscar `upsertByIdentifier` en `contact/service.ts` y quitar/ajustar la rama `sourceId`.
- Licencia: en `startup.ts` quitar el `return` degradado y volver al `process.exit(1)` original.
