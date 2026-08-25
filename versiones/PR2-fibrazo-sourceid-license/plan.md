# PR #2 — Plan: fix 404 "Pausa" + licencia + start.sh

## Objetivo
1. Arreglar el 404 que rompía el flujo "Autodiag - Pausa" en Telegram (sysbrazo no encontraba el contacto).
2. Que la app **no crashee** cuando no hay `LICENSE_KEY` (el worker se moría con "Refusing to start" y dejaba la cola de chat acumulada).
3. Dejar un `start.sh` y un runbook para levantar todo sin pasos manuales.

## Diagnóstico
- sysbrazo mandaba `sourceId: 6644285761` pero `upsertByIdentifier` no tenía esa rama → 404.
- `packages/business/src/enterprise/license/startup.ts` hacía `process.exit(1)` sin licencia → el worker moría al bootear.
- No había script unificado de arranque.

## Decisión
- Código fix en el fork (no tocar sysbrazo): el usuario pidió explícitamente fix de código, no de DB.
- Mantener enterprise (el usuario quería la edición enterprise, no bajar a community).
