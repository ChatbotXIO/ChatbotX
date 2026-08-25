# PR #3 — Plan: roles y borrado de owners desde la UI

## Objetivo
Que un admin pueda **borrar a un owner** y **cambiar el rol** (Owner/Agent) de un miembro
desde la interfaz, sin tocar la base de datos (antes requería SQL a mano).

## Reglas de negocio definidas
1. Un owner se puede **eliminar** siempre que quede **al menos otro owner**. Solo el último owner está protegido.
2. Se puede **cambiar el rol** de un miembro entre `owner` y `agent`.
3. **Nunca** dejar el workspace sin owner: no se puede degradar al último owner.

## Decisión
- La UI de miembros ya tenía el diálogo "Editar miembro" → se le agrega el selector de rol.
- Guards server-side en las actions (no solo UI).
