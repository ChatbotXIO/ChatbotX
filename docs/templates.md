# Templates

A template is a saved copy of a workspace's resources that other workspaces can
install. This document describes how the feature behaves. For how to test it, see
[templates-testing.md](templates-testing.md); for the white-label default template, see
[tenancy.md](tenancy.md#default-template-for-new-workspaces); for adding a new kind of
resource, see `.agents/skills/template-integration/SKILL.md`.

## Terms

| Term | Meaning |
|---|---|
| Publisher | The workspace that owns the template. |
| Installer | A workspace that installed it. `publisherRef` is the opaque reference the publisher sees for it. |
| Payload | The saved snapshot: `resources` (always created) and `manifests` (found or created by a natural key, such as a tag's name). |
| Version | One saved payload. `TemplateVersion.changes` records what it added, changed and removed. |
| Copy | A row an install created, tracked in `TemplateInstalledResource`. |

## Creating a template

- The form opens with **Create a folder on the installed account** on, **Allow editing after install** on,
  **Allow deleting after install** off and **Auto-update installed templates** off. The public API has the same defaults for
  `allowEdit` and `allowDelete`.
- An item can be marked view-only. A view-only copy cannot be edited by the installer.
- The edit page drops selected items that were deleted since, so they cannot block a save.
- A save that changes the content creates a new version. Comparison ignores JSON key order.
- The Versions tab of the edit page lists each version's changes per category.

## Sharing

- The share link is `/t/template?id=<templateId>&key=<shareToken>`, and the install page is
  `/t/template/install?id=…&key=…`. Both are rewrites in `next.config.ts`; older `/t/<token>`
  links still open.
- The link is built on the host serving the workspace (`resolveTemplateShareUrl`), so a
  white-label tenant gets its own domain. The share page shows that tenant's logo.
- Install lists the workspaces where the user is owner or admin, never the template's own,
  and offers creating a new one.

## Creating a workspace from a share link

Choosing "Create a new workspace" remembers the choice for five minutes in Redis
(`templateInstallIntentService`, key `template-install-intent:<userId>`), alongside a
marker cookie.

- The share-link template **takes the place of the tenant's default template** for that one
  workspace.
- The intent is read and deleted in one step, so one workspace at most uses it, whether
  the creation succeeds or fails.
- Only the flow started from the share page consumes it (`consumeInstallIntent`,
  `continuesInstallIntent`). Leaving for an unrelated page clears it
  (`TemplateInstallIntentGuard`), and so does creating a workspace any other way.
- Redis being down never blocks a workspace: it is created without the template.

## What an install copies

Installs run in the worker inside one transaction, from a `pending` `TemplateInstallation`
row (lease, retries and a sweep re-dispatch included).

- **Pipelines** travel as structure only: the pipeline, its stages and fields. Items,
  members and access rows never travel.
- **Members and inbox teams** never travel. Assignees on a Pipelines step are removed. An
  Assign conversation step is kept with nobody in it, so its flow installs as a draft with
  an `assigneeRequired` warning.
- **A flow is skipped** when a required reference cannot be kept, such as a step pointing at
  a pipeline deleted at the source (`flowSkippedRequiredReference`). A flow that cannot run as
  it arrived installs as a draft (`flowNotPublished`).
- **Existing rows are reused** where the kind has a natural key, and are never moved or
  renamed. A custom field whose name is taken by another type is created as `<name>_<n>`.

### Folders

Tags and custom fields carry `folderSourceId` in the manifest, left out at the root. A row an
install **creates** goes to its template folder, else the install folder, else the root.
A folder of a category the installer may not use is not created, and neither is its root.

### List order

Lists keep the source's order after an install:

1. `inSourceOrder` sorts resources and manifests oldest first, by source id, when a payload
   is applied. Saved templates need no change.
2. `flushTracked` calls `spreadCreatedAt`: `now()` is constant in a transaction, so rows
   created together would share `createdAt`. Each created row moves one millisecond past
   the one before it. Reused rows are not touched.
3. Children keep their own column: stage and field `position`, sequence step `order`,
   question `orderNo`. Product categories copy `rank`, left out at the default of 10.

Tag and custom field lists also break `createdAt` ties by id (`withIdTieBreak`).

Installations that ran before this keep the order they got. Two source rows created in the
same millisecond on different processes can swap, because ids only grow within a process.

## Warnings and errors

Each warning has a code, stored as `entityKind` on `TemplateInstallation.warnings`.
`warningGroups` shows them one entry per resource, by name, with skipped resources first.

| Reader | Sees |
|---|---|
| Installer (installation page, installs list) | `TEMPLATE_INSTALLER_WARNING_CODES`: what they can act on, and what did not arrive. |
| Publisher (View Analytics → Details) | Every warning of that installer's newest copy, and the error if it failed. |
| Nobody, in the groups | `workspaceMember` and `inboxTeam`: not carrying them is by design. |

A new warning code is publisher-only until it is added to that list. `warnings`,
`warningCount` and `warningSummary` on the API still hold all of them;
`installerWarningCount` is what the installer sees.

A warning about a pipeline that "no longer exists" is not a failed copy: the template points
at something deleted at the source. Fix the flow there and save the template.

## View Analytics

Opened from the row menu or the Installs number of My templates. One box lists the
installers (name, last installed, version, auto-update, Details, Uninstall), the other the
number of installs per version. Details reads
`GET /v1/templates/{id}/installers/{installerId}/issues`, named after the publisher's own
resources: nothing of the installer's workspace is exposed.

## Publisher access

A copy in the same tenant grants the publisher access: the workspace name is shown and the
publisher can uninstall. The UI offers no switch for it; the installer can still change it
through `PATCH /v1/template-installations/{id}` (`publisherUninstallGrant`). A copy across
tenants is not granted: it shows "Workspace not shared" with Uninstall disabled.

## Updates and uninstall

- **Sync** applies a newer version to a copy, automatically with auto-update on. It uses the
  same manifest and order steps as an install. A locally edited item is backed up before
  being replaced, and can be restored from the sync history.
- The sync history shows only counts above zero: added, updated, no longer following the
  template, not updatable yet.
- A sequence step a new version no longer has is switched off, not deleted: deleting it would
  cascade over its dispatches inside the sync's transaction. A contact reaching it moves on as
  at any inactive step, and the installer can remove it in the editor. Pending dispatches keep
  their time when a delay changes, as in the sequence editor.
- A failure a retry can never fix (`PERMANENT_TEMPLATE_ERROR_CODES`) is not retried by the
  auto-update for that version; a manual sync or a newer version can still run.
- A reinstall during a running auto-update is refused with `templateSyncInProgress`: its consent
  choice is kept, and the installer retries.
- **Uninstall** deletes what the install created and keeps shared rows, rows that existed
  before, and copies something else depends on. It runs in the background and can be
  retried.

## Template store

Each tenant (the platform's root, or one white-label) curates its own public store of approved templates. A store is never shared across tenants.

- **Managing it:** `/admin/template-store` (super admin, root store) and `/manage/template-store` (reseller, their own store). Add picks a template of that tenant by name or Template ID and, optionally, categories. Categories are chips above the table: filter by one, rename, reorder or delete it from its menu. A template with no category is still published and shows under "All".
- **The public page:** `/store`, on the host being visited. It shows that host's tenant's store, an unknown host the platform's. The header is the install page's. A card opens `/t/template?id=…&key=…` with the template's *current* key, so a rotated key is followed without any stored copy. Search and category are in the URL (`?q=`, `?category=`).
- **What is shown:** a template that is live, belongs to the same tenant as the store, has its share link on and not expired. Anything else stays listed in admin with its status (`Published`, `Share link off`, `Template unavailable`) and is hidden publicly.
- **Limits and concurrency:** at most 50 categories and 500 templates per store. Every write takes a per-tenant advisory lock, so caps, category order and replacing a template's categories cannot race. Adding a template twice answers "already in your store".
- **Tables:** `TemplateStoreCategory` (tabs, `lower(name)` unique per tenant), `TemplateStoreListing` (one approved template per tenant), `TemplateStoreListingCategory` (links).
- **Public API:** `GET /v1/template-store` (`templateStore.list`, filters `categoryId` and `keyword`) returns the token workspace's tenant's store: `categories` and `templates` with `shareToken` and `shareUrl`. Preview with `templatePreviews.get` (its `id` is the share token) and install with `templateInstallations.install`. Managing the store (approving, categories) has no API: platform administration is exempt from AGENTS.md invariant 23.

## Public API

| Area | Operations |
|---|---|
| Templates | `GET`/`POST /v1/templates`, `GET`/`PUT`/`DELETE /v1/templates/{id}`, `selectable-resources`, `dependencies-preview`, `locked-resources` |
| Store | `GET /v1/template-store` |
| Sharing | `GET {id}/link`, `PUT {id}/share`, `POST {id}/share/rotate`, `GET /v1/template-previews/{id}` |
| History and installers | `GET {id}/versions`, `{id}/analytics`, `{id}/installers`, `{id}/installers/{installerId}/issues`, `…/uninstall-preview`, `POST …/uninstall` |
| Installations | `GET`/`POST /v1/template-installations`, `GET`/`PATCH {id}`, `POST {id}/retry`, `GET {id}/resources` |
| Sync and uninstall | `POST {id}/sync`, `GET {id}/syncs`, `{id}/syncs/{syncId}`, `POST {id}/backups/{backupId}/restore`, `GET {id}/uninstall-preview`, `POST {id}/uninstall`, `POST {id}/uninstall/cancel` |

## Deploying

- Apply the migrations `20261103090000` to `20261111043231` (the last one adds the template store tables). They stay four: enum values
  must commit before use, and the two `CONCURRENTLY` index builds run outside a transaction.
- Restart the builder: the `/t/template` rewrites live in `next.config.ts`.
- Install, sync, uninstall and the auto-update fan-out run on their own `template` queue,
  consumed inside the `default` worker process with `TEMPLATE_WORKER_CONCURRENCY` (default 2):
  saving a widely installed template queues one sync per installation there, never on the
  shared `default` queue. Every job is backed by its row, so a job left on another queue
  is re-dispatched by the five-minute sweep.
- Writers of an installed resource lock it per resource (`tpl-res:` advisory locks). Local
  edits and deletes, restores and the uninstall take it exclusive. A sync takes the copies
  it may overwrite exclusive and the manifest resources it only reads (bot fields,
  pipelines, tags, folders, ..., created by the install or reused) shared. A writer that
  only adds a reference through `assertReferencable` (a deal in an installed pipeline, a
  ref link or keyword pointing at an installed flow) takes it shared: references never
  wait for each other, nor for a running sync when the resource is a manifest one (a deal
  in an installed pipeline); a reference to a copy the sync overwrites (a flow) waits for
  that sync. The uninstall's exclusive lock still waits for them and sees them. A bot
  field value write still goes through the edit guard (exclusive), so it waits for a
  local rename, a sync or an uninstall of that field.
- Template jobs carry a BullMQ priority: installs, uninstalls and a sync someone asked for
  run before the background syncs and fan-outs a template save queued. Background work is
  aged, not starved: the five-minute sweep re-enqueues what is still waiting in the
  interactive lane, which raises the queued job.
- Same-tenant copies from before the publisher access default need their
  `publisherUninstallGrant` updated by hand; there is no migration for it.
