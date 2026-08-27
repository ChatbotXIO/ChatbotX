# PR #3 — Resumen: qué se hizo

**Branch:** `feat/workspace-members-role` · **Commit:** `d82e723a1` · **Merge:** `277e931f9` (PR #3)

## Archivos tocados (feature `workspace-members`)

| Archivo | Cambio |
|---------|--------|
| `actions/delete-workspace-member.action.ts` | Borrar owner permitido si `ownerCount > 1`; solo bloquea al último owner ("You cannot delete the last owner...") |
| `actions/update-workspace-member.action.ts` | Guard de rol: no se puede demotar al último owner ("You cannot demote the last owner...") |
| `schema/mutation.ts` | `updateWorkspaceMemberRequest` ahora incluye `role: workspaceMemberRoles` |
| `components/update-workspace-member.tsx` | `RadioGroupField` con Rol (Owner/Agent) en el diálogo Editar miembro |
| `messages/en.json` | Claves `fields.role.owner` / `fields.role.agent` |

## Bugs descubiertos DESPUÉS (arreglados en PR #4)
- `workspaceMemberService` se usaba **sin importar** en la action de update → el guard crasheaba en runtime.
- `role` tipado como `string` (heredado del modelo DB) → ahora enum `"owner" | "agent"` en `schema/resource.ts`.

## Cómo revertir / re-modificar
- Todo vive en `apps/builder/src/features/workspace-members/`. Los guards cuentan owners con
  `workspaceMemberService.listByWorkspaceId({ workspaceId })`.
