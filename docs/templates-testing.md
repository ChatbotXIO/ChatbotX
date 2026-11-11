# Templates — regression testing

How to re-check the Templates feature (share, install, lock, sync, uninstall)
after a change. Three layers, cheapest first:

1. **Automated tests** — run on every `pnpm test`.
2. **End-to-end API run** — `scripts/templates-e2e.mjs`, against a running
   environment, public API only.
3. **Manual UI checklist** — what only a browser can show.

Run layer 1 for any change under `packages/business/src/template`,
`packages/database/src/repositories/template-*`, `apps/builder/src/features/templates`
or a list page that shows template locks. Run layers 2 and 3 before a release.

## 1. Automated tests

```bash
pnpm --filter @chatbotx.io/business exec vitest run __tests__/template
pnpm --filter builder exec vitest run __tests__/template __tests__/platform-default-template __tests__/public-template-sign-in-prompt.test.tsx __tests__/proxy-public-routes.test.ts
pnpm --filter @chatbotx.io/flow-config exec vitest run __tests__/template-export-schema.test.ts __tests__/remap.test.ts __tests__/reference-registry-completeness.test.ts __tests__/unresolved-references.test.ts
pnpm --filter worker exec vitest run __tests__/install-template-handler.test.ts __tests__/sync-template-installation-handler.test.ts __tests__/uninstall-template-handler.test.ts __tests__/redispatch-template-jobs.test.ts __tests__/run-leased-template-job.test.ts
```

| Area | Rule | Tests |
|---|---|---|
| Snapshot | Dependencies collected even when their category is not selected; dropped references counted; view-only copies refused | `business/__tests__/template-snapshot-*.test.ts`, `template-flow-reference-dependencies.test.ts` |
| Payload | v1 and v2 payloads parse; incomplete flow nodes are kept as drafts | `business/__tests__/template-format-compat.test.ts`, `flow-config/__tests__/template-export-schema.test.ts` |
| References | Every `*Id`/`*Ids` slot has a policy; unresolved references are removed by slot shape | `flow-config/__tests__/reference-registry-completeness.test.ts`, `unresolved-references.test.ts`, `remap.test.ts`, `business/__tests__/template-reference-sanitizer.test.ts` |
| Name collisions | Same-type fields reused, other types renamed `<name>_<n>`, concurrent installs get distinct suffixes, a field an earlier install copied is reused | `business/__tests__/template-custom-field-*.test.ts`, `template-field-token-binder.test.ts`, `template-resolve-manifests.test.ts` |
| Install preview | The preview predicts what the install does (reuse / rename / create / bind), including reuse of an earlier copy | `business/__tests__/template-install-preview.test.ts` |
| Flow state | Published source → published copy keeps `active`; draft or unresolved → inactive draft with `flowNotPublished` | `business/__tests__/template-flows-adapter.test.ts`, `template-install-regressions.test.ts` |
| Copy names | Calendars, questionnaires and duplicates get a free copy name | `business/__tests__/template-calendar-install-name.test.ts`, `template-naming.test.ts` |
| Durability | One claim wins, lost jobs and expired leases are re-dispatched, permanent errors fail once | `worker/__tests__/install-template-handler.test.ts`, `run-leased-template-job.test.ts`, `redispatch-template-jobs.test.ts` |
| Locks | View/Edit and Delete permissions, installer-owned fields stay editable, republishing a view-only copy is refused | `business/__tests__/template-install-locks.test.ts`, `template-resource-locks.test.ts`, `template-item-permissions.test.ts`, `template-installed-resource.test.ts`, `template-column-slot-guards.test.ts` |
| Lock UI | Delete disabled on undeletable rows; Rename/Duplicate disabled on view-only rows | `builder/__tests__/template-lock-badge-undeletable.test.tsx`, `template-selection-lock.test.ts` |
| Permissions | Category permission per actor; read-only tokens never write; members see only installations of categories they hold | `business/__tests__/template-permissions.test.ts`, `template-service-authorization.test.ts`, `template-installation-request.test.ts`, `builder/__tests__/templates-public-*.test.ts` |
| Tabs | "My templates" needs `flows`; "Installed" needs any category permission | `builder/__tests__/template-tabs-permissions.test.ts` |
| Sync | Hash gate, local edit backed up before overwrite, restore, kinds not updatable reported | `business/__tests__/template-sync-*.test.ts`, `template-fingerprint.test.ts`, `template-flows-backup.test.ts` |
| Auto-update | Refused once the source is deleted, or on a failed / uninstalled installation | `business/__tests__/template-sync-request.test.ts`, `builder/__tests__/template-installation-auto-update-action.test.ts` |
| Uninstall | Decide / freeze / drain, kept outcomes (shared, has dependents, locked by another), fencing, notices | `business/__tests__/template-uninstall-*.test.ts`, `worker/__tests__/uninstall-template-handler.test.ts` |
| Tenant default | Staging skips drifted configs and aborts on operational errors; hashed-key status; generic errors; the version pin keeps the requested version; staged row has no installer and no publisher consent and keeps its source on retry; dispatch after every creation path's commit | `business/__tests__/template-installation-stage.test.ts`, `template-default-template-status.test.ts`, `tenant-default-template-service.test.ts`, `template-installation-dispatch.test.ts`, `workspace.service.test.ts`, `integration/tenant-default-template-db.test.ts` (`test:db`; includes the history table), `connections/__tests__/connect-session-start.test.ts`, `builder/__tests__/platform-default-template-*.test.ts*` |
| Template store | Per-tenant isolation, one listing per template (concurrent double add), caps counted under the tenant lock, category order with concurrent moves, non-numeric ids read as not found, a template without a category stays published, share-live parity (an expiry equal to now is live), candidate search (tenant, listed, deleted, literal `%`/`_`, limit 20); platform scope needs a super admin (also in cloud, where one owns no tenant), tenant scope the caller's own; public API takes the tenant from the token, never input; `/store` search and category filter without accents | `database/__tests__/integration/template-store-repository.test.ts`, `business/__tests__/integration/template-store-db.test.ts` (`test:db`), `builder/__tests__/template-store-actions.test.ts`, `template-store-public-api.test.ts`, `template-store-search.test.ts`, `public-template-sign-in-prompt.test.tsx`, `proxy-public-routes.test.ts` |
| Publisher view | Installers grouped per workspace, no raw ids or emails | `business/__tests__/template-publisher-installations.test.ts` |

## 2. End-to-end API run

Needs two workspaces of one tenant and three workspace API tokens with the
`templates` scope: a full token of the publishing workspace, and a full and a
`read_only` token of the installing workspace. The publishing workspace should
hold at least one item in each category (flows, keywords, triggers, sequences,
products, calendars, questionnaires, coupon topics, pipelines, webchats, AI
agents/functions/MCP servers, comment automations, entry point links, saved
replies).

```bash
CHATBOTX_API_URL=https://localhost:3123/api \
TPL_SOURCE_TOKEN=... TPL_TARGET_TOKEN=... TPL_TARGET_RO_TOKEN=... \
NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem" \
node scripts/templates-e2e.mjs
```

AI agents, functions, MCP servers and knowledge files need an AI integration
in both workspaces (the AI pages and AI file uploads refuse without one). In a
development database an `Integration` row (`integrationType` `openai`) with an
`IntegrationOpenai` row holding a placeholder key is enough to exercise
install, locks and uninstall; embedding then fails on the chunks, which is
expected and not a template issue. Copied knowledge files land under
`workspaces/<target>/ai-files/tpl-<installationId>/` and are removed from
storage on uninstall.

It builds a template of every category (the first item of each view-only,
deleting forbidden), installs it into the target, then checks:

| Check | Expected |
|---|---|
| `SHARE` | Expiry kept when omitted; an expired, disabled, unknown or rotated-away link all answer the same generic reason; the rotated link works |
| `PREVIEW` | The share link previews as installable |
| `INSTALL` | `completed` or `partial`, never a `flowNode` warning |
| `REFERENCES` | No installed flow still carries an id of a source resource (selected items, tags, custom fields): every reference was remapped or removed |
| `LOCK-DELETE` | Every created copy refuses delete (`templateAllowDeleteViolation`) |
| `LOCK-FLOW` | A view-only flow refuses rename, duplicate and export (403) |
| `READ-ONLY` | A `read_only` token can read but not install, sync or change auto-update |
| `REINSTALL` | Reinstalling updates in place (`syncId`); the same idempotency key replays the same answer |
| `REPUBLISH` | No view-only copy can be put into a new template (`templateIncludesViewOnlyCopy`) |
| `RETRY-ACTIVE` | Retry is refused unless the installation failed |
| `PUBLISHER-PRIVACY` | The publisher's installer list carries no raw ids or emails; another workspace gets 404 |
| `AUTO-UPDATE` | An unchanged save creates no version; a changed save syncs the copy whose auto-update is on (`autoUpdate` sync) and only marks the other copy `updateAvailable`. A new copy takes the template's default; `autoUpdate` on the install request only applies when updating an installed copy in place |
| `UNINSTALL` | Read-only uninstall refused; the uninstall counts equal the preview |

It exits non-zero when a check fails, and uninstalls and deletes what it
created (`TPL_KEEP=1` keeps them for inspection).

### Recovery of stuck installs

Not covered by the script because it needs database access. In a development
database, make an installation look stuck, then run the sweep. `pnpm dev` does
not run schedules (`apps/worker/src/core.ts` leaves them out), so start
`pnpm --filter worker worker:schedule` (it runs every five minutes, after a
five-minute grace), or call `redispatchTemplateJobs()` from
`apps/worker/src/schedule/handlers/redispatch-template-jobs.ts` once:

- **Lost job** — an installation `pending` for more than five minutes with no
  queued job is re-enqueued and completes.
- **Dead worker** — an installation `installing` whose `claimedAt` is older than
  the lease (15 minutes) is re-claimed and completes.
- Only one installation per workspace and template can be `pending` or
  `installing`; a second one violates
  `TemplateInstallation_workspaceId_sourceTemplateId_active_key`.

### Auto-update fan-out at scale

Also needs database access. Install a one-keyword template (text reply, no
flow, default auto-update on) once, then clone that installation row 500 times
(`completed`, `autoUpdate` true, no tracked resources). Change the keyword in
the source and save the template. Expected: 501 `autoUpdate` syncs (one batch
of 500, then one of 1), all `completed` within seconds, every installation at
the new `sourceVersion`, no installation with two syncs, and 501 target
keywords carrying the new text (a clone without copies gets the keyword
created, rule "new in the template").

Clean up through the public API, uninstall first, and pace the calls: the
public API answers `429 tooManyRequests` after about 120 calls in its window,
so retry after a pause instead of firing hundreds at once.

## 3. Manual UI checklist

| Page | Check |
|---|---|
| Templates → My templates | Columns name, share, installs (active installs only), contents; Create button |
| Templates → Installed | Status filter; uninstalled rows show the notice; auto-update switch disabled on uninstalled, failed and deleted-source rows |
| Installation detail | Breadcrumb Tools › Templates › Installed › name; one tab per resource category with its count, the whole category listed (Created / Reused / View only) with no Load more; only warnings the installer can act on (a flow left out or a draft, a credential or inbox to add, a step to finish), grouped per resource by name, ten per page; no warning counts on the category tabs; sync history; restore of a backup |
| Lists after an install (flows, tags, custom fields, keywords, triggers, products…) | Same order as the source workspace; tags and fields in their template folders |
| Template → Versions tab | Newest first, current version marked; each version names what was added, changed and removed per category; "First version" for version 1; a version saved before changes were recorded says so |
| Share link (`/t/template?id=…&key=…`; older `/t/{token}` links still open) | Top bar with the tenant logo and, signed out, Sign in; image, name and publisher; Preview (only with a test link, new tab) and Install; video; About this template. Install leads to `/t/template/install?id=…&key=…` (sign-in first when signed out): the template card, "Select a workspace", one row per workspace with its logo and Install, and "Create a new workspace". A row's Install opens a popup: per-channel inbox picker; collision preview (reused / renamed / unbound); "already installed" offers view, update and install another copy |
| Every list page holding copies (flows, triggers, keywords, sequences, comment automations, calendars, questionnaires, pipelines, products, coupon topics, webchats, AI agents/functions/MCP servers, folders) | "View only" badge; view-only rows: Rename, Duplicate and Delete disabled, Move and Edit (read-only) available; editable rows whose template forbids deleting: Delete disabled only |
| Editors of view-only copies | Banner "installed from a view-only template"; save disabled |
| Member permissions | A member without `flows` gets not-found on My templates, sees only installations of categories they hold |
| Settings → Default template (`/manage/default-template` as a reseller, `/admin/default-template` as super admin) | Empty ("Not set", no Clear); invalid id or key shows the translated error under the key; share off shows its own error; save shows the badge "Active" and keeps the saved ID and key in the form (key masked until the eye is pressed); Clear confirms first and removes the saved ID and key; after the publisher rotates the share link the badge reads "Key invalid", the saved values stay shown, and saving them again is refused. A workspace created afterwards (first workspace, webchat, Telegram connect) lists the template as "Installed automatically" |
| Share link → Install (`/t/template/install`) | The list offers the user's workspaces that may take the template (never the one it was made in; an owner and an admin both qualify); under it, "Create a new workspace" leads to the channel picker; a platform (root tenant) template is offered to white-label workspaces too |
| Template store (`/admin/template-store`, `/manage/template-store` as a reseller) | Add category sits top left, every category chip is shown (name cut with a tooltip when long); a chip filters, click again clears; its menu renames, moves up/down, deletes with a count; the table has the search box (name or ID), a status filter and Reset; Add opens a template picker (type a name or paste an ID, results show name, ID and workspace) and optional categories; a row menu has Edit categories, Open template page (published only) and Remove; the icon at the title's right opens `/store` in a new tab; empty store and no-match states read differently |
| Store page (`/store`) | Heading, search, category chips with counts and an "All" chip (hidden with no category, or one holding every template); a long name is cut at two lines, a long description at three; clicking a card opens its template page with Install; a store with only uncategorised templates shows them with no chips |
| Template → Add | "Create a folder on the installed account" is on for a new template |
| Templates → row menu → View Analytics (popup) | A popup titled with the template, with a Workspace box and a Versions box: a search box and one row per installer workspace (name, last installed, version with an "update available" badge, auto-update, Details, Uninstall); Details opens every warning and the error of that installer's newest copy; a copy a white-label default installed carries an "Automatic" badge; a copy across tenants shows "Workspace not shared" with Uninstall disabled; an uninstall in progress refreshes the list on its own |
| Template share panel | Template ID and Key shown with the link, key masked until revealed, both copyable; hidden while sharing is off |
| Narrow screen (≤ 500 px) | No horizontal page scroll on My templates, Installed and the detail page |
| Light and dark theme | Status badges, warning counts and disabled switches readable in both |
| Locales | With the `NEXT_LOCALE` cookie set to each of the 21 locales in `apps/builder/messages`, the tabs show that locale's `templates.tabs.mine` / `templates.tabs.installed` and no raw `templates.*` key |

## Known behavior that is not a template bug

- Admin list searches match accents exactly (`quần` ≠ `quan`); only the web
  shop search and keyword matching fold accents.
- A keyword editor shows "Please select" when its flow is inactive: the flow
  picker lists active flows only.
