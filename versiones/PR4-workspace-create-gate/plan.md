# PR #4 — Plan: crear workspaces solo admin + CI verde

## Objetivo
1. **Impedir que usuarios no-admin creen workspaces.** Descubrimos que cualquier usuario logueado
   podía crear un workspace conectando un canal (Telegram, Messenger, WhatsApp, Webchat, Instagram) —
   la card de la home estaba gateada, pero el flujo real de creación **no**.
2. **Dejar el CI verde** (Lint + Tests) para poder mergear.

## Diagnóstico
- `workspaceService.create()` no validaba nada (solo límite community/quota).
- Los 8 llamados a `create()` son flujos de conexión de canal (verificado: no hay signup ni worker).
- CI Lint rojo por: claves i18n faltantes en 19 idiomas (culpa de PR #3) + errores pre-existentes en main.
- CI Tests rojo por: 13 tests de license desactualizados contra el comportamiento degraded del fork.

## Decisión
- Gate **central** en `workspaceService.create()` (un solo punto cubre los 8 flujos), no en cada action.
- Solo `PLATFORM_ADMIN_EMAIL` (demo@example.com) puede crear workspaces.
- Actualizar los tests para que documenten el comportamiento real del fork (degraded ≠ exit).
