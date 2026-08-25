# versiones/ — Registro de cambios por PR

**Propósito:** entender QUÉ se modificó y POR QUÉ en cada PR del fork `fibrazo/sysbrazo`.
Si mañana algo no funciona, o hay que volver a tocar algo, buscamos acá: cada carpeta
tiene el plan que se siguió y el resumen de lo que se hizo (archivos + cómo volver a modificarlo).

## PRs registradas

| PR | Branch | Qué fue |
|----|--------|---------|
| [#2](PR2-fibrazo-sourceid-license/) | `fix/fibrazo-sourceid-license` | Fix 404 `sourceId` + licencia enterprise sin key + start.sh |
| [#3](PR3-workspace-members-role/) | `feat/workspace-members-role` | Borrar owner + selector de rol Owner/Agent |
| [#4](PR4-workspace-create-gate/) | `fix/workspace-create-gate` | Gate de creación de workspaces + CI verde (lint/i18n/tests) |

> PR #1 (`feat/fibrazo-fork-setup`) — setup inicial del fork: realtime auth URL, host binding,
> healthcheck, etc. Está documentada en `FORK-CHANGES.md` (secciones 1-5).

**Convención:** cada carpeta tiene `plan.md` (lo que nos propusimos) y `resumen.md`
(lo que se hizo de verdad, archivo por archivo).
