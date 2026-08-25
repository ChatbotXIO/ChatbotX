# PR #5 — Plan: ocultar "Add workspace" para no-admins + limpiar workspace del asesor

## Objetivo
1. Que un usuario **no admin** (ej. el asesor `federico.rampi+asesor@42mate.com`) **no vea** la opción
   de crear/agregar workspace en ningún lado de la UI.
2. Eliminar el workspace propio que el asesor se había creado (debía trabajar solo en el workspace
   principal vía equipo, no tener workspace propio).

## Diagnóstico
- La **card** de la home (`workspaces-list.tsx`) ya estaba gateada con `isPlatformAdmin` (PR #4).
- **PERO** el **workspace-switcher** (`components/workspace-switcher.tsx`, el menú de workspaces del
  sidebar — abajo) tenía el item "Add workspace" **sin gatear**: lo veía cualquier miembro.
- El layout (`/space/[workspaceId]/layout.tsx`) ya calculaba `isPlatformAdmin` y se lo pasaba a
  `AppSidebar`, pero `AppSidebar` no se lo reenviaba al switcher.
- El asesor tenía un workspace propio "test" (`11665507949297664`, rol owner) creado **antes** del
  gate de PR #4 (conectando un canal de prueba).

## Decisión
- Gate en la UI: el item solo se renderiza si `isPlatformAdmin` (consistente con la card de la home).
- Borrar el workspace "test" del asesor (era basura: 0 contactos, 0 conversaciones, 1 inbox, 0 flows).
