# PR #5 — Resumen: qué se hizo

**Branch:** `fix/workspace-switcher-gate` · **Commit:** `debeafafe` · **PR:** (la que abrió Fede)

## 1. Fix UI: ocultar "Add workspace" para no-admins

| Archivo | Cambio |
|---------|--------|
| `apps/builder/src/components/workspace-switcher.tsx` | Nueva prop `isPlatformAdmin` (default `false`); el item "Add workspace" (DropdownMenuItem → `/channels/create`) solo se renderiza si `isPlatformAdmin` |
| `apps/builder/src/components/app-sidebar.tsx` | Pasa `isPlatformAdmin={isPlatformAdmin}` al `WorkspaceSwitcher` (el valor ya venía del layout) |

Cadena de datos: `/space/[workspaceId]/layout.tsx` → `isPlatformAdmin(user)` → `AppSidebar` → `WorkspaceSwitcher`.

## 2. DB: eliminado el workspace propio del asesor

- `Workspace "test"` (`11665507949297664`, owner `federico.rampi+asesor@42mate.com`) → `DELETE` con cascade.
- Resultado: el asesor queda solo como **agent de "Fibi"** (equipo Soporte Autodiag). No tiene workspace propio.

## Verificación
- `pnpm --filter builder check-types` ✅
- biome lint sobre los 2 archivos ✅

## Cómo revertir / re-modificar
- Quitar el `{isPlatformAdmin ? (...) : null}` del switcher para volver a mostrar el item a todos.
- El workspace borrado no se puede recuperar (era basura de prueba).

## Nota (build pendiente)
- El fix aplica al **rebuild del builder** (mismo proceso de siempre).
