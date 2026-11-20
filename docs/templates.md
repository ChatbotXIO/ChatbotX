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

### Tools (magic links, polls, dynamic images, place locations)

Each ships its configuration and none of its history. The payload is `formatVersion` 3, so a
worker that predates it refuses the template instead of dropping the tools: deploy the worker
before the builder.

- **Magic links** copy `name` and `url`; click statistics never travel. The name is the URL
  path, so a taken name becomes `<name>-copy`, `<name>-copy-2` (URL-safe) and the text that
  links to the old path is rewritten to the copy.
- **Polls** copy their candidates and images, not their votes. The after-vote flow is
  patched once flows exist. A candidate's (or the poll's) text that links to a tool
  installed after the polls is rewritten in Phase 2 (`rewritesLinksInPatch`). A poll whose
  end already passed installs with a `scheduleExpired` warning.
- **Dynamic images** copy the canvas and the enabled flag; the static background is copied
  at stage time. An image whose background could not be copied is skipped (`dynamicImage`
  warning). When the cache custom field already existed in the installer's workspace it is
  not claimed (editing or deleting the image clears its values): the image installs without
  one (`dynamicImageFieldNotBound`).
  **Self-hosters:** the renderer fetches every image URL in a canvas (and the background it
  bakes) through the SSRF guard (`fetchFollowingSafeRedirects` + `assertPublicUrl`): the URL and
  each redirect hop must resolve to a public address, so private or internal hosts are refused.
  The one exception is the workspace's own `storageUrl`, which is trusted, so keep object
  storage that lives on an internal network reachable through that URL. Each fetch has a 15 s
  timeout and a 20 MB cap (`packages/business/src/dynamic-image/render.ts`).
  A static QR or text layer is baked into the background, so when its link was rewritten
  to a copy the install switches the copy off and renders the background again after the
  commit (`dynamicImageRerenderFailed` when that fails: it stays off). The re-render is a
  compare-and-set under the template lock (still off, still the staged background): an edit,
  toggle, delete or an uninstall that got there first wins, and only the file the re-render
  uploaded is removed. The install marks such a copy (in the same transaction as the freeze,
  on its provenance row's `syncedHash`, which dynamic images never use otherwise); the marker
  is cleared by a successful re-render or by the installer saving the image. Turning on a
  marked copy re-renders it first; if that fails the toggle is refused with
  `dynamicImageBackgroundStale` (409), so turning it on again is the retry and it never
  serves the creator's link. A copy without the marker (switched off in the source or by the
  installer) enables with no render.
- **Place locations** copy the name, coordinates and the category by name.
- **Links inside copied text** (flows, keywords, triggers, ...) that carry a workspace or
  tool id are rewritten to the copies (`RESOURCE_LINK_PATTERNS`,
  `packages/business/src/template/resource-links.ts`); the origin, `token`/`userId`
  parameters and fragment stay as typed. A link to a tool that did not come along stays as
  written and warns (`linkNotRemapped`). When collecting a selection, a link to a magic
  link (`/r/<workspaceId>/<name>`, by name) or a poll (`/l/<workspaceId>/p/<id>` or the
  `pl_<base62>` payload) of the source workspace pulls that tool in as a hard dependency
  (`collectLinkedToolDependencies`, one query per kind); another workspace's link, an
  unknown name or an unknown poll pulls nothing.
- **Uninstall** deletes the copies with the history they gathered (click stats, votes,
  rendered per-contact images) and the images the install staged.
- **View-only** locks the name, URL, dates, candidates, canvas and coordinates; toggles and
  the cache field binding stay the installer's. Auto-update is not supported for these.

### Tools (Mini Apps, minigames, leaderboards)

- **Mini Apps** copy their screens and custom-field mappings (rebound to the installer's
  fields; an unresolved mapping is cleared with a warning). Submissions, uploads and
  publications never travel, and a Mini App **published to WhatsApp is not offered** (and is
  not pulled in as a dependency): its Flow lives on the creator's number. The Flow JSON is
  regenerated from the screens. An uninstall keeps a copy the installer published.
  A flow that opens such a Mini App (a button's `miniAppId`, or a `mini-apps?id=` link) loses
  that reference on install; the editor and `templates.previewDependencies`
  (`miniAppPublishedExcluded`: `flowName` + `miniAppName`, one row per flow and Mini App)
  tell the publisher which flows are affected. Only Mini Apps of the source workspace count.
- **Minigames** copy their settings, images, prizes **and the remaining stock** (the schema
  keeps one quantity; unlike the Duplicate button, which starts without prizes) and keep
  `enabled`. Plays, players and the four counters never travel. Tags and the prize-name field
  are rebound; the sharing and follow-up flows are written once flows exist (a flow that did
  not come along turns that message off). A rename changes `generalSettings.name` too.
- **Leaderboards** install as a **draft** with their rules, window and reward settings;
  participants, scores and the reward ledger never travel. Post ids and Telegram groups are
  cleared (a `postSelectionRequired` warning). A channel leaderboard needs an inbox of its
  own channel that the installer bound, and a gamification one needs its minigame in the
  template; without it the leaderboard is **skipped, never widened**. Uninstall hard-deletes
  the copy and drops its Redis ranking after the commit (the public delete is soft).
- Public links to these tools in copied text are rewritten like the G1 tools'
  (`minigames?minigameId=`, `mini-apps?id=`, `leaderboards?leaderboardId=`, tokens kept).

### Ecommerce extras (opening hours, vendors, discount codes, store settings)

- **One rule for the whole Ecommerce group** (products, product categories, opening hours,
  vendors, discount codes, store settings): when the workspace sells from a connected Shopify or
  WooCommerce store it is **not offered**, and nothing of it is collected or pulled in as a
  dependency (a collector that returns nothing, the picker lists nothing). Installing into such a
  workspace **skips the whole group** with one `externalStoreSkipped` warning per category. The
  rule is applied at four seams: `listSelectableResources`, `resolveIds` for `mode: "all"`, the
  dependency expansion (all three through the collectors, `adapters/external-store-collector.ts`),
  and `runInstall` (read through the install transaction, `external-store.ts`).
- **Opening hours** copy the name and ranges (always new rows). **Vendors** are found by name
  among the store's own and reused as they are; only a vendor the install creates gets the copied
  fields, its schedule and categories (a category without its parent is dropped as a pair).
- **Discount codes** are found by code and reused as they are. They install **switched off** (an
  active automatic code would take money off carts at once), with a use count of 0. A code limited
  to **specific customers is not copied** (its filter names the creator's customers). A code whose
  products or category did not all come along is skipped with `discountCodeSkipped`, never turned
  into "every product".
- **Store settings** are one row per workspace: the general, currency, shipping and checkout
  choices are copied, but payment methods, the Facebook pixel, the store source and the
  external-checkout options are not. A workspace that already has settings **keeps them**
  (`storeSettingsKept`). A checkout or confirmation flow that did not come along falls back to
  the default mode. **Uninstall always keeps this row** (after an install it also holds what the
  installer entered and configures a store that may be taking orders).

### Instagram story automations

- A story automation copies its name, trigger (reply or mention), schedule, reply (a flow or AI
  agent it runs is re-pointed at the copy and ships with it; text and "no reply" pass through),
  keyword filter and folder. The reply counter starts at 0.
- **The story ids never travel** (they are the source account's): a "specific stories" target
  ships empty and the automation installs **switched off** with `storySelectionRequired`. A
  story-mention automation has no story filter, so it is not affected.
- The account it runs on is re-bound through the install's inbox bindings, and must be an
  account of the **same Instagram connection type** (Instagram Login or Facebook Login). A scoped
  automation without such an account installs with no account and **switched off**
  (`inboxBindingRequired`): it is never widened to "every account". One that was for "every
  account" stays so but is also installed switched off, for the installer to confirm.
- It is switched on only when the source had it on **and** the account, the stories and the
  reply's flow or agent all resolved.
- View-only locks the name, trigger, reply, keyword filter and schedule. The stories, the account
  and the on/off switch stay the installer's. Uninstall stops it, then deletes the row (nothing
  references it, so nothing blocks it).

### Inbound webhooks

- An inbound webhook copies its name, contact identifiers, field mappings and actions. It
  **never** copies the endpoint token (every copy mints its own `iwh_` token), the sample
  payload, the request log or the request counter, and it always installs **switched off**: it
  receives only after the installer has looked at it and turned it on.
- The inbox rule `inbox` mode is re-bound through the install's inbox bindings. When the inbox
  was not bound the copy installs **without a rule** (`inboxBindingRequired`) and cannot be
  switched on until the installer chooses one; the source's inbox id is never kept. A rule read
  from the payload (`payload` mode) holds no ids and is copied as it is.
- A mapping to a custom field is remapped to the installer's field (the field ships in the
  `customFields` manifest). A mapping whose field did not come along is **dropped with a
  warning**. The actions are remapped like trigger actions (flows, tags, custom and bot fields);
  a reference that cannot be kept is removed with a warning, never left as the source's id.
- The workspace holds at most 100 inbound webhooks. The cap is held by a per-workspace
  transaction lock shared by the normal create and the install, so an install near the cap
  installs what fits and skips the rest with `inboundWebhookLimitReached`.
- **View-only** locks the name, identifiers, field mappings and actions. The on/off switch, the
  token (rotating it is the installer's own act, and an uninstall in progress still refuses it),
  the sample payload and the inbox rule stay the installer's: the inbox rule is one column that
  holds either the installer's inbox choice or a shipped payload path, so it is not half-locked.
  Auto-update is not supported.
- Uninstall switches the copy off, drains its delivery log in batches and deletes the row. A
  flow, tag or field that an inbound webhook of the installer's own references keeps the copy
  from being deleted together with it (the actions are probed like a trigger's).

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
