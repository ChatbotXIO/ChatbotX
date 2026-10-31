---
name: template-integration
description: >-
  Keep the Templates feature (share a snapshot, install it into another
  workspace, View-only locks, auto-update sync, uninstall) whole when a
  feature adds or changes a resource. Use when adding a resource a user builds
  (flow-like content, automation, AI resource, product data, settings), a new
  table or column holding such content, a new id/reference field (flow step,
  trigger action, contact filter, JSON config), a service write/delete path of
  an existing template-copied kind, or a list/editor UI for one.
---

# Template integration (ChatbotX)

A template copies resources into another workspace and keeps managing the
copies afterwards: View-only copies refuse content edits, auto-update
overwrites them, uninstall deletes them. Every resource kind and every
reference to one is registered in a few strategy maps. **A kind or a reference
that a map does not know is silently mishandled**: it is not copied, its id
dangles in the target workspace, a locked copy can be edited, or an uninstall
cascades away the installer's data. Most maps are compile-checked or
test-checked; the rest are listed below so nothing relies on memory.

Code lives in `packages/business/src/template/` (engine, adapters, guards),
`packages/flow-config/src/import-export/` (payload schema, reference policy),
`packages/database/src/partials/template.ts` (kinds/categories enums).

## 1. Decide first: does the feature touch templates?

| Your change | Do |
|---|---|
| A new resource a user builds and would want to share (Chatrace parity: if Chatrace's template editor lists it, so must we) | Section 2 (new category) |
| A new field on an existing template-copied kind | Section 3 (field) |
| A new place that stores an id of a flow, tag, field, sequence, product, inbox… (flow step, trigger action, condition, contact filter, JSON column) | Section 4 (reference) |
| A new service method that writes or deletes a kind templates copy | Section 5 (guards) |
| A list page or editor for such a kind | Section 6 (UI) |
| None of the above | Nothing; say so in the PR |

Kinds templates copy today: `templateResourceKinds` in
`packages/database/src/partials/template.ts` (flow, trigger, keyword, sequence,
calendar, webchat, comment automation, reflink/QR, product, saved reply,
pipeline, AI agent/function/MCP server/file, questionnaire, coupon topic, and
the natural-key manifests tag, custom field, bot field, folder, product
category, inbox).

## 2. A new category (resource kind)

Register, in this order (deploy readers before writers, see the plan's D2):

1. **Enums** — add the category to `templateResourceCategories` and the kind to
   `templateResourceKinds` (`partials/template.ts`). The Postgres enum
   `templateResourceCategory` gets an `ALTER TYPE … ADD VALUE` in **its own
   migration** (forward-only; read `drizzle-database`). The payload category is
   `.default([])` in `template-schema.ts`, and a payload that uses it is
   `formatVersion` 2.
2. **Adapter** — `adapters/<category>.ts` implementing `ResourceAdapter`
   (`adapters/types.ts`): `collect` (with `manifestRefs` and hard dependencies),
   `insert` (writes through repositories/`tx`, never a guarded service),
   `stage` if it copies storage objects (deterministic keys, see
   `template-object-keys.ts`), `sync` with `project`/`fingerprintProjection`
   and `serializeBackup`/`restoreBackup` (or `updateNotSupported`).
   Register it in `adapters/registry.ts` — `satisfies
   Record<TemplateResourceCategory, ResourceAdapter>` makes a missing adapter a
   **compile error** — and place it in `TEMPLATE_INSTALL_ORDER` after what it
   references (defer references to later kinds with `deferredKinds`).
3. **Selection** — the category's lister in `listSelectableResources`
   (`selectable-resources.ts`, keyset paginated) and `FOLDER_TYPE_CATEGORY`
   (`adapters/registry.ts`) if it lives in folders.
4. **Permission** — `TEMPLATE_CATEGORY_PERMISSION` (`permissions.ts`): which
   workspace permission may include/install it.
5. **Lock policy** — `TEMPLATE_LOCKED_CONTENT_KEYS` (`lock-policy.ts`, typed
   `Record<TemplateResourceKind, …>`: **compile error** if missing). List only
   content the template actually ships; settings the installer must supply
   (credentials, domains, connected accounts, widget branding the snapshot
   never carries) stay unlocked.
6. **Uninstall** — a handler in `adapters/uninstall-handlers.ts` (`satisfies
   Record<CopiedResourceKind, …>`: **compile error** if missing). Its
   `uninstallDelete` must call the service's own `deleteInTx(tx, …)` core —
   the same one the public delete uses (one implementation) — and record
   post-commit effects (cache, events, storage) as `effect(...)`, never run
   them inline. Declare `heavyChildren` and drain them in bounded batches;
   `freeze`/`unfreeze` stops producers; `protectedDependents` uses
   `probedDependents(kind)` when anything can reference the kind.
7. **i18n** — the category label and any new warning code under
   `templates.*` / `templates.warningCodes.*` in every `apps/builder/messages/*.json`.
8. **Public API & CLI/MCP** — the category appears in the `templates` API
   schemas automatically; run `cli-mcp-docs` if a procedure or flag changes.

## 3. A new field on a template-copied kind

- Snapshot it in the adapter's `collect` and write it in `insert`/`update`, or
  it silently does not travel. Add it to `fingerprintProjection` (or the
  auto-update cannot tell an edited copy from an untouched one) and to
  `serializeBackup`/`restoreBackup`.
- Content the template ships → add the key to `TEMPLATE_LOCKED_CONTENT_KEYS`.
  Installer-owned (toggle, account binding, runtime value) → do not.
- If it holds an id, it is also a reference: section 4.

## 4. A new reference to another resource

An id copied as-is from the source workspace dangles in the target. Every slot
that stores an id needs a policy:

- **Flow step / node fields** — `REFERENCE_KIND_POLICY` and, when a key's kind
  depends on the step, `STEP_REFERENCE_OVERRIDES`
  (`flow-config/src/import-export/reference-fields.ts`). Policies: `copy`,
  `naturalKey`, `verifyInTarget`, `strip`, `external`. Required slots need a
  `slotShape`. Caught by `packages/flow-config/__tests__/reference-registry-completeness.test.ts`.
- **Contact filter field** — `CONTACT_FILTER_FIELD_REFERENCE`
  (`contact-filter-references.ts`); caught by
  `packages/database/__tests__/contact-filter-reference-coverage.test.ts`.
- **A column or JSON column of another table that points at a copied kind**
  (e.g. `Reflink.flowId`, a menu's flow id) — `COLUMN_SLOTS` /
  `JSON_CONTAINERS` / `INBOUND_REFERENCE_KINDS` in `uninstall-references.ts`,
  so uninstall keeps a parent something still uses instead of cascading it.
- **Collection** — the adapter's `collect` must report it (`manifestRefs` for
  tags/fields/folders, a hard dependency for copied kinds), so the snapshot
  ships what the copy references.
- **Writers of the referencing row** call `assertReferencable` (section 5) so
  no new reference lands on a copy that is being uninstalled.

## 5. Guards in services (write and delete paths)

Every service method that changes a template-copied kind:

- **Content edits** — `assertResourceEditable({ workspaceId, resourceKind,
  resourceIds, changedKeys, referencedParents, tx })`
  (`installed-resource.service.ts`) **first in a locked transaction**
  (`withTemplateLockedTransaction` with `initialKeys`, or the guard's own lock
  acquisition), before any read or diff. Pass the keys that actually changed:
  `changedKeysOf(existing, patch)` for a patch, or for a full-form save that
  rewrites child rows, re-read the stored resource after the write and use
  `changedStoredContentKeys({ resourceKind, before, after, parentKeys, keyMap })`
  so "" vs null, server defaults and new child-row ids are not edits (see
  `productService.updateFull`, `appointmentCalendarService.update`).
- **Deletes** — `assertDeletable` with the full id list (bulk paths too), and
  extract the row writes into a `deleteInTx(tx, { workspaceId, ids })` core
  shared with the uninstall handler.
- **New references** — `assertReferencable` for parents the write points at.
- Never take a `tpl-res:` advisory lock any other way than through
  `acquireTemplateResourceLocks` / `withTemplateLockedTransaction` (one sorted
  acquisition per transaction; growth retries).
- Add the method to the mutation-matrix DB test
  `packages/business/__tests__/integration/template-mutation-matrix-db.test.ts`:
  a View-only copy refuses a content edit with nothing sticking, and an
  installer-owned edit still saves.

## 6. UI

- **List pages** — wrap the table in `LockedIdsProvider` (one lookup per page;
  pass only the page's ids) and render `LockBadge` in the name cell
  (`features/templates/components/lock-badge.tsx`).
- **Editor pages** — `LockedEditorGuard` (banner + lock context); wrap only the
  controls for locked keys in `LockedContent`. Save stays enabled when any
  installer-owned control remains. Dialogs use `LockedDialogFieldset` /
  `useIsLocked` and keep Cancel/close outside the locked region; rich-text
  editors go read-only through `useReadOnlyWhenLocked`.
- After a mutation that installs, syncs or uninstalls, invalidate
  `orpc.templatesAPI.key()` (AGENTS.md invariant 21).

## 7. Before merge

- `pnpm --filter @chatbotx.io/business check-types` (registry, lock policy and
  uninstall handler maps fail to compile when a kind is missing).
- Run: `reference-registry-completeness`, `contact-filter-reference-coverage`,
  `template-sync-handler-coverage`, `template-uninstall-handlers`,
  `template-installed-resource`, and the DB suites
  `template-install-db`, `template-uninstall-db`, `template-mutation-matrix-db`
  (one at a time: `cd packages/business && pnpm exec dotenv -e ../../.env --
  vitest run __tests__/integration/<file> --maxWorkers=1`).
- Browser: install a template with the new kind into a second workspace, open
  the copy View-only, sync it, uninstall it.
