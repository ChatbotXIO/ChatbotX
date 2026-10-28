# Pipelines (CRM kanban boards)

A pipeline is a board of ordered **stages** that holds **items** (one per
contact deal, ticket or card). Three types ship: `opportunity`, `ticket` and
`custom` (`pipelineTypes`); the type only picks defaults (first stage name,
status labels, the noun the UI uses). Items are moved by members on the board,
by flows (the **Pipelines** step), by triggers, and by agents through the
public API, CLI and MCP.

Code map: tables `packages/database/src/schema/pipeline.ts`, constants and
settings `packages/database/src/partials/pipeline.ts`, repositories
`packages/database/src/repositories/pipeline/`, services
`packages/business/src/pipeline/`, builder feature
`apps/builder/src/features/pipelines/`, flow step
`packages/flow-config/src/steps/pipeline.ts`, variables
`packages/variables/src/pipeline-variable.ts`.

## Data model

Ten tables (migration `20261025155532_pipelines`):

| Table | Role |
|---|---|
| `Pipeline` | Name, `type`, stable `referenceName`, `currency` (nullable override, see [Currency](#currency)), `settings` jsonb. Unique per workspace on `referenceName` and on `name`. |
| `PipelineStage` | Ordered by `position`; colors, description. `bulkJobId` is set while a queued stage job owns the stage. |
| `PipelineItemCounter` | One row per workspace holding `lastNumber`; mirrors `EcommerceOrderCounter`. |
| `PipelineItem` | The card: `number` (unique per workspace), title, plain-text description, `value` (`numeric(19,4)`; writes are rounded half away from zero to four decimals with `roundToMoneyScale` before the diff, so repeating an over-precise amount is a no-op, not a new `valueChanged`), `status`, `priority`, `dueDate`, `fieldValues` jsonb (`Record<PipelineField id, string>`), `stageEnteredAt`, `statusChangedAt`, current-closure `closedAt`, `lastCommentAt`, `idempotencyKey`. |
| `PipelineItemAssignee` | Workspace members and inbox teams assigned to an item (one unique index per kind). |
| `PipelineItemComment` | Comments; optional `idempotencyKey`. |
| `PipelineItemAttachment` | Links an item to a media-library file (unique per item and file). |
| `PipelineItemActivity` | Append-only history (see Analytics), partitioned `HASH("workspaceId")` x 32 (primary key `(id, workspaceId)`; every read and delete filters by `workspaceId`, so it prunes to one partition). No foreign key on `itemId`/`contactId`, so rows outlive the item and contact; the pipeline delete is the only cascade. Bodies of descriptions, fields and comments are never stored, and a deleted contact's item titles are cleared (see "When referenced data is deleted"). |
| `PipelineField` | Per-pipeline custom field (`referenceName` unique per pipeline, `type`, `required`, `position`). |
| `PipelineMember` | Per-pipeline ACL row: `canView`, `canEdit`, `canDelete`, `canManageSettings`. |

Rules worth knowing:

- **Item numbers** come from the counter row, per workspace, not per pipeline.
- **Idempotency keys.** `PipelineItem` has a partial unique index
  `(workspaceId, pipelineId, idempotencyKey) WHERE idempotencyKey IS NOT NULL`;
  `PipelineItemComment` has the same per item. A replay returns the first
  result **before** any limit or required-field check. Max length 128
  (`PIPELINE_LIMITS.idempotencyKey`). Flows derive the key themselves (below).
- **No drizzle `.default()` for jsonb.** `settings` and `fieldValues` are
  `NOT NULL` with no database default; every insert path writes the full parsed
  value (see AGENTS.md on jsonb defaults).
- **Item status** is `open | won | lost`; the stored status never changes with
  the pipeline's labels. `Pipeline.settings.statusLabels` (per pipeline, max 40
  chars) is display text only: ticket/custom pipelines default to
  `Resolved` / `Not Resolved`.
- **Settings** (`pipelineSettingsSchema`, `version: 1`):
  `assignContactOnAssign`, `maxOpenItemsPerContact` (1-100 or null),
  `visibleFeatures` (priority, value, dueDate), `cardElements`, `statusLabels`.
  Updates go through `pipelineSettingsPatchSchema` and `mergePipelineSettings`,
  which merges key by key so an untouched group is never reset.
- Deleting a contact cascades its items (FK); activity rows stay.

## Currency

`Pipeline.currency` is a **nullable override**: `null` means the pipeline follows
the workspace. The currency every reader sees (boards, API, events, variables)
is the **effective currency**, `override ?? workspace default`, where the
workspace default (`resolveWorkspaceDefault`, `pipeline/currency.ts`) is the
primary currency of `Workspace.targetCountry` (`primaryCurrencyForCountry`,
`@chatbotx.io/utils/country-currency`), or `USD` when the country is `null`,
`"unknown"` or has no currency. The store currency is not consulted: a
workspace without a store must not show one.

Changing the currency never converts a value.

The rules with no I/O (`workspaceCurrencyDefault`, `applyEffectiveCurrency`)
live in `pipeline/currency-rules.ts`; `pipeline/currency.ts` adds the cached
workspace read. Variable rendering reads `Workspace.targetCountry` in its own
query and applies the rules directly, so it never loads the pipeline or
workspace services.

- **Responses.** `currency` stays the effective string (backward compatible);
  `currencyOverride` is the stored value or `null`. One mapper
  (`withEffectiveCurrency` / `withEffectiveCurrencies`) serves every read, with
  at most one workspace read per request and none when every row has an
  override. The authoring catalog and access-check rows stay raw.
- **Writes.** Create stores `null`. `pipelines.update` takes a 3-letter code to
  set an override, or `currency: null` to follow the workspace again.
  Duplicate copies the override (including `null`).
- **Existing rows.** Pipelines created before this existed keep their stored
  value (copied from the store currency at creation) as an explicit override, so no board changes unit on deploy. To follow
  the country, switch the pipeline to "Follow workspace" or send
  `currency: null`.
- **Events and webhooks.** The currency is resolved once per operation (item
  create, update, move; a transfer uses the destination pipeline; a stage
  removal once per batch) and captured when the event is emitted, so a queued
  webhook delivers the currency it was emitted with.
- **Open boards.** When `Workspace.targetCountry` is written,
  `notifyWorkspaceCurrencyChange` publishes the structure-changed realtime event for
  every pipeline of the workspace (200 per keyset page), so every open board and
  inbox panel refetches: those that follow show the new unit, and every settings
  sheet shows what "follow the workspace" now resolves to. It notifies on every write rather than on a
  detected change: a before/after comparison races with a concurrent save, and
  a refetch is cheap.
- **Templates.** Export writes the raw override; a `null` follows the workspace
  that installs it. Install keeps a valid code as an override and stores
  `null` for anything else.
- **Accepted staleness.** The workspace row is cached with `withCache`. A read that overlaps a save can repopulate the old value until
  the next save or the 24 h TTL (`packages/redis/src/cache-utils.ts`). This is
  the same guarantee every workspace setting has, and currency is display-only.
- **Deploy.** Apply the migration (a nullable drop, safe for old code), then
  replace builder and worker together: an old instance cannot read a `null`
  currency. Rolling back to an old version is unsafe once `null` rows exist.

## Access scope and ACL

Every service method takes a `PipelineAccessScope`
(`packages/business/src/pipeline/access.ts`), resolved by the app layer:

| `scope.kind` | Who | Access |
|---|---|---|
| `workspaceToken` | A workspace API token | Full. The token scope `pipelines` is the gate; per-pipeline member grants do not apply. |
| `support` | Platform support session | Full, like an owner. |
| `system` | The workspace's own automation (Pipelines flow steps) | Full; the run is recorded as the actor (`kind: "flow"`). |
| `member` | A workspace member | `isWorkspaceAdmin` (owner/admin) bypasses the ACL; any other member holds only what their `PipelineMember` row grants. No row means no access. `canViewContactEmailAndPhone` is the member's contact `emailAndPhone` permission. |

Contact email and phone follow the contacts list rule: tokens and support
sessions see them; a member only with `canViewContactEmailAndPhone`. Without
it, every item read (board, stage page, `listItems`, `getItem`, contact items)
returns the contact with `email`/`phoneNumber` null, and a search does not
match on email or phone, so they cannot be inferred by searching. Pipeline
admin rights do not grant this permission.

Item activity (`listActivity`) carries the current names of the stages and pipelines each row references (`fromStageName`, `toStageName`, `fromPipelineName`, `pipelineName`). A transferred item's history spans pipelines, so names are returned only for pipelines the caller can view (and their stages); others come back `null` and render as "—".

`edit`, `delete` and `manageSettings` imply `view`
(`normalizePipelinePermissions`), so a row can never grant a write without read.
Actions are `view | edit | delete | manageSettings` (`PipelineAction`).
`pipelineService.requireAccess` is the single gate; `list` filters a plain
member's list to the pipelines they can view (`listViewablePipelineIds`).
Permissions rows are managed via `listMembers` / `setMember` / `removeMember`;
the settings sheet hides owners and admins because they bypass the ACL.

## Mutation engine and post-commit effects

Services are siblings over two shared bases, never a chain:
`PipelineBaseService` (access, cache tag, locks, naming) under
`pipelineService` (pipelines), `pipelineStructureService` (stages, fields),
`pipelineMemberService` (ACL rows) and `pipelineTemplateService` (template
installs); `PipelineItemBaseService` (item lock and transaction) under
`pipelineItemService` (item lifecycle) and `pipelineItemContentService`
(comments, attachments). Repositories follow the same split:
`pipelineItemRepository` (item rows, listing), `pipelineItemContentRepository`
(comments, attachments), with the WHERE builder in `item-filter.ts`, custom
field SQL in `field-condition.ts` and sort/cursor in `item-cursor.ts`.

All item writes go through `mutation-engine.ts`: the service computes the item
before and after, `diffPipelineItem` derives the difference, and two tables
turn the diff into outputs, so a new attribute is one entry in each:

- `ACTIVITY_BUILDERS` -> activity rows (written **inside** the transaction).
- `EVENT_BUILDERS` -> post-commit effects.

Effect kinds (`PipelineEffect`): `event` (trigger/webhook event), `realtime`
(`pipelineItemChanged`) and `assignContact` (assigns the contact's conversation
when `settings.assignContactOnAssign` is on; the trigger context is
`pipeline` / `<pipelineId>:<itemId>`).

`assignContact`: a conversation moves to the
item's new primary assignee only when it is **unassigned or still with the
previous primary**; a conversation someone else owns keeps its assignee, and the
setting never unassigns. The effect carries the transition
(`previousAssignedId` → `assignedId`); under the per-contact advisory lock it
re-reads the item's **current** primary and asks
`conversationService.assignByContactIds` to move conversations whose assignee
is unassigned or either side of that transition. The eligibility check runs on
the `FOR UPDATE`-locked rows inside `updateAssignment`, so a concurrent manual
assignment is never overwritten, and quick changes (A→B→C) end on C whatever
order their effects run in.

**Guarantee level.** `dispatchPipelineEffects` runs after the transaction
commits, in order. A failing effect is logged (`err`, `effectKind`) and never
fails the request that already succeeded: effects are **at-most-once and
best-effort**, the same level as every other post-write event on the platform.
Activity rows and the data change itself are transactional; events, webhooks,
realtime pushes and contact assignment are not. A transfer between pipelines
emits `pipelineItemMovedToStage` with `fromPipelineId`, a `deleted` realtime
change for the source pipeline and a `created` one for the destination.

## Locking order

Always take advisory locks first, then row locks, in the order the path below
lists. The orders differ per path and are the ones the code actually uses:

- **create**: advisory -> stage (shared) -> field rows (shared, id order).
- **update / transfer**: advisory -> item `FOR UPDATE` -> target (destination)
  stage `FOR SHARE` (only when the stage changes) -> field rows `FOR SHARE`
  (id order).
- **stage drain** (inline or queued batch): advisory structure lock -> the
  source stage exclusively, then only the items in it.
- **comment / attachment writes**: the item row only.
- **field delete**: advisory structure lock -> the field row (exclusive, so it
  waits for writers holding the share lock).

1. **Advisory** (`acquirePipelineAdvisoryLock`), by purpose:
   - a workspace naming lock for create/rename/duplicate/template resolution;
   - a per-pipeline structure lock (`structureLockKey`) for stage/field edits,
     stage deletion and every batch of the queued stage job;
   - a per-(workspace, pipeline, contact) "open item" lock, taken whenever an
     item is created or asked to become `open`, so `maxOpenItemsPerContact`
     cannot be raced. A transfer takes the lock of both pipelines in sorted
     order so two opposite transfers cannot deadlock.
2. **Stage**: writers put an item into a stage under a **shared** row lock
   (`lockShared`) and refuse a stage whose `bulkJobId` is set; stage deletion
   takes the **exclusive** lock (`lockExclusive`), so a writer in flight
   finishes first and later writers find the stage gone. An item that does not
   change stage skips the stage lock.
3. **Item**: `lockForUpdate`. The item is re-checked after the lock because it
   may have been transferred between the peek and the lock. (Update and
   transfer lock the item before the target stage; create has no item yet.)
4. **Field rows**: writers that store custom field values take `FOR SHARE` on
   the `PipelineField` rows they write, in id order, and reject a field that
   was deleted meanwhile; `deleteField` deletes the row (exclusive) before
   stripping the key.

## Stage deletion and bulk moves

`PipelineStageBulkService.deleteStage` (needs `manageSettings`), optionally
with `moveItemsToStageId`:

- **<= 2000 items** (`PIPELINE_LIMITS.bulkSyncItems`): drained inline in one
  transaction, then the stage row is removed. Returns `{ queued: false }`.
- **> 2000 items**: the stage gets a `bulkJobId` (one fresh id per attempt),
  a job is added and `{ queued: true, jobId }` is returned (HTTP stays
  successful; the stage is hidden from writers until the job ends).
  The job runs on the **`default` queue** as
  `DefaultJobAction.processPipelineStageBulk` (handler
  `apps/worker/src/default/handlers/pipeline-stage-bulk.ts`). Like every
  default job it is skipped for a blocked owner (`runGuardedDefaultJob`),
  and then releases the stage's own claim so the stage is not left hidden. It
  works in batches of `PIPELINE_LIMITS.bulkBatchSize` (500) per transaction,
  taking the structure lock per batch, not across batches.

Items leave the stage as the job runs, so a retried job continues where it stopped.
If enqueueing fails the `bulkJobId` claim is released and the error rethrown; a
claim whose job is gone (failed for good, or never enqueued and older than the
60 s enqueue grace window, `STAGE_CLAIM_ENQUEUE_GRACE_MS`) is reclaimable by a
new delete request; a live job, or a younger claim whose request may still be
enqueueing, answers `409 stageBusy`. The claim time is read from the job id.

Moving items to another stage emits the same events as a single move, per item.

Drain batches are `UPDATE/DELETE ... WHERE id IN (subselect LIMIT n)` with the
stage, pipeline and workspace repeated on the **outer** WHERE, so a candidate
that left the stage while the statement waited on its row lock is re-checked
and skipped. A batch can therefore come back short or empty while rows remain:
the drain ends only when the stage count is 0 (a job that keeps seeing empty
batches throws and is retried). Items cannot be moved or transferred **out of**
a stage that has `bulkJobId` set either (`409 stageBusy`, same as moving in).

Queued jobs carry their claim id (`bulkJobId` in the payload) and check
`stage.bulkJobId === claim` before every batch, the cleanup and the final stage
deletion; a job whose claim was replaced stops without mutating anything. When
the workspace owner is blocked the job no-ops and releases its own claim (only
if it still holds it), so the stage is not left busy.

Naming the item's current stage in an update (for example a flow "move to
stage" onto the stage it is already in) is a no-op and is allowed even while
that stage is busy.

## Pipeline and field deletion

- **Pipeline delete** first removes the pipeline's items and then its activity
  in 500-row batches, each in its own short transaction that takes the
  structure lock only for that batch and re-verifies the pipeline exists, then
  deletes the pipeline row (cascading only what was written since). No
  per-item activity is recorded because the activity is deleted with the
  pipeline. It is refused with `409 stageBusy` while any stage has a
  `bulkJobId`; finish or reclaim that stage delete first.
- **Field delete** removes the field row under the structure lock, then strips
  the key from items in 500-row keyset batches (by id) in separate
  transactions. The strip is maintenance and does not change `updatedAt`.
  Item create/update/transfer take a `FOR SHARE` lock on the `PipelineField`
  rows they store values for (in id order, after the item lock) inside the
  write transaction and reject a field that no longer exists; the delete's
  exclusive row lock therefore waits for in-flight writers and later writers
  are rejected, so no committed write can reintroduce the key after the strip.
  The row delete and the strip are separate commits, so a retry of
  `deleteField` for an already-absent field id (same `manageSettings`
  authorisation, digit-only id) still runs the scoped strip walk before
  answering the usual `404`; an interrupted delete is therefore always
  cleaned up by repeating it.
- The FK columns that cascade or `SET NULL` on user, member, team, stage and
  pipeline deletes each have a leading index (migration
  `pipeline_fk_indexes`), so those deletes never scan a whole table. The
  migration runner applies plain `CREATE INDEX` like its siblings (no
  `CONCURRENTLY`), which briefly blocks writes to the table while it builds.

## When referenced data is deleted

| Deleted | What happens |
|---|---|
| Contact | Its items, assignees, comments and attachments cascade (contact delete is hard and chunked). History rows stay for analytics, with `itemTitle`/`fromTitle`/`toTitle` cleared in the same transaction (`scrubContactTitles`, index `PipelineItemActivity_contact_idx`), since titles often hold the contact's name. Counts heal within the cache TTL; open boards on their next refetch. |
| Workspace member | `PipelineMember` and `PipelineItemAssignee` rows cascade; flows that name the member skip it. |
| User account | `createdById` / `closedById` / comment author / `actorUserId` are set null: the drawer shows only dates, history and analytics show "Former member". |
| Inbox team, media file | Assignee / attachment rows cascade. |
| Pipeline field, stage | See the flow step rules ("Deleted references"); board filters drop deleted fields. |
| Pipeline | Its flow steps route to `error`; trigger and webhook conditions pinned to it stop matching and their editor shows "Deleted or unavailable pipeline/stage" instead of "any" (a stage is only cleared when the user picks another pipeline). |
| Any of them, mid-write | A row deleted between the existence check and the insert fails the foreign key (23503); `mutate` turns it into a 404 instead of a 500 and a job retry. |

Contact filters (`pipelineItem`) are evaluated as SQL only, so a deleted
pipeline or stage never fails a segment or broadcast: positive operators match
nothing, and the negative ones (`isEmpty`, `notIn`) match every contact, which
is the literal meaning ("has no item in it"). The filter chip names such a
pipeline "Deleted or unavailable pipeline".

## Reads: keyset cursors and sort contract

The board reads each stage with a first page (`perStageLimit`, default 50)
plus the stage's total count and value; `listStagePage`, `listItems` and
`listComments` continue by cursor. No offsets anywhere. The contact-items list
(inbox panel, `listContactItems`) returns the contact's newest 100 items and
has no cursor.

- **Sort keys** (`pipelineItemSortKeys`): `createdAt`, `updatedAt`, `value`,
  `dueDate`, `priority` (rank high 3 > medium 2 > low 1), each `asc | desc`;
  default `createdAt desc`.
- **Order tuple** `(nullRank, sortValue, id)`. `NULLS LAST` in **both**
  directions (only `value` and `dueDate` are nullable); `id` is the tie-breaker,
  so ordering is total and stable.
- **Cursor** is opaque base64url JSON `{v:1, sort, dir, nullRank, sortValue, id}`
  built from the last row, with the sort value read as text from Postgres so
  timestamps keep microseconds. It is bound to its sort key and direction; a
  cursor from another sort, version or malformed value fails closed as
  `422 validation` on `cursor` (`InvalidPipelineCursorError`).
- **Predicate.** A non-nullable key continues with a row comparison
  `(sortValue, id) < (cursor.sortValue, cursor.id)` (or `>`), so the btree
  starts at the cursor instead of re-reading earlier rows; `value` and
  `dueDate` keep the `OR` form that also walks their NULLs.
- `listBoardFirstPage` reads every column's first page in one query (a
  `JOIN LATERAL … ORDER BY … LIMIT perStageLimit + 1` per stage, re-sorted by
  the same tuple outside) and builds each column's "load more" cursor with
  `cursorFor` from the extra row, so the first page needs no cursor.
- Each card carries a contact summary (name, avatar, email, phone; email and
  phone masked per the access scope) and the
  `channel` of the contact's most recently active connection
  (`contactInboxRepository.listLatestAnalyticsAttribution`, one batched
  `DISTINCT ON` query per page; null without a connection), which the UI shows
  as a brand badge on the avatar.
- Filter (`PipelineItemFilter`): stages (max 200), statuses, priorities,
  contact, assignee members/teams, search (numeric/`#123` matches the item
  number), value range, due/created/updated ranges, custom-field conditions
  (below) and activity ranges.

### Custom-field filter

One operator vocabulary serves the board sheet, the private/public API and the
SQL: `is, isNot, hasValue, noValue, contains, notContains, startsWith,
endsWith, gt, lt, between` (`pipelineFieldOperators`). A field type offers a
subset, in display order (`PIPELINE_FIELD_OPERATORS_BY_TYPE`):

| Field type | Operators | Operand input |
| --- | --- | --- |
| shortText, longText, email, phoneNumber | is, isNot, hasValue, noValue, contains, notContains, startsWith, endsWith | one text box |
| number | is, isNot, hasValue, noValue, gt, lt, between | number; `between` = two |
| date, datetime | is, isNot, hasValue, noValue, gt, lt, between | a day picker (`YYYY-MM-DD`, also for datetime); `between` = two |
| boolean | is, isNot, hasValue, noValue | Yes/No select |

- **Shape**: `fieldConditions: { [fieldId]: { operator, value?, valueTo? } }`,
  strings only. `between` takes `value` (lower) and `valueTo` (upper), inclusive,
  either may be omitted for an open bound. Number operands are numeric strings,
  date operands `YYYY-MM-DD`, boolean operands `"true"`/`"false"`. The public
  list takes one field at a time: `fieldId`, `fieldOperator`, `fieldValue`,
  `fieldValueTo`, `timezone`.
- **Meaning by comparison kind** (`FIELD_STRATEGY_BY_KIND` in
  `repositories/pipeline/field-condition.ts`): text compares case-insensitively
  (`is`/`isNot` exactly); numbers numerically; dates by calendar day; booleans
  by `true`/`false`. `hasValue`/`noValue` are the same for every kind (a missing
  key or an empty string is "no value"; a malformed non-empty value still
  "has a value").
- **`isNot` and `notContains` only match items that have a value** (a
  well-formed one for numbers, dates and booleans). Use `noValue` or
  `hasValue` to ask about presence; an item without the field is never
  "different from" a value. This is one rule for all kinds.
- **Dates** compare by calendar day: `is` = same day, `isNot` = a value on a
  different day, `gt` = after that day, `lt` = before it, `between` = inclusive
  day range. A `date` field stores the picked day (midnight in the writer's
  zone) and compares that **written day** (`left(value, 10)`), so everyone sees
  the day the drawer shows. A `datetime` field is an instant and compares its
  day in the request's IANA `timezone` (the board sends the browser's; the
  public API defaults to the workspace timezone, resolved in
  `PipelineItemQueryService.resolveFieldFilter`):
  `(instant AT TIME ZONE tz)::date`. Values are cast only when well-formed.
- **Numbers** accept the plain decimals and the exponent form
  `canonicalNumberLiteral` stores for very small/large values (`1e-7`).
- **Safe on bad data**: malformed stored values (non-numeric text in a number
  field, `2026-02-30`, `not a date`) never throw and never match a comparison.
  Operands are bound parameters; an unknown timezone falls back to UTC in SQL
  (the API rejects it with 422).
- **Validation (422)** in `PipelineItemQueryService` via
  `pipelineFieldConditionError`: a field id that is not a field of the
  pipeline, an operator the field's type does not offer, a missing or
  malformed operand.
- The old `fieldValues` (exact equality) and `fieldDateRanges` filter params
  and the relative presets of date fields were removed with this model.

## Caching policy

- **Two workspace-level entries are cached**, both for the whole workspace and
  filtered per caller afterwards, so the ACL is never part of a cache key
  (`pipelineService.listWithPermissions`):
  - pipeline rows `pipelines:{workspaceId}:rows`, TTL **60 s**, tag
    `pipelines:{workspaceId}` — dropped by pipeline and structure changes
    (create, rename, settings, delete, duplicate, stages, fields, template
    install via `invalidateList`). Member grants do not touch it: the ACL is
    read after the cache, never stored in it;
  - item counts per pipeline `pipelines:{workspaceId}:counts`, TTL **60 s**,
    tags `pipelines:{workspaceId}` and `pipelines:{workspaceId}:counts` — the
    second is dropped after the commit of any write that adds or removes items
    (create, delete, transfer, bulk stage jobs: `dispatchPipelineEffects`
    invalidates it from the `created`/`deleted`/`bulk` realtime effects).
  Edits and moves drop neither entry. **Known exception:** deleting a contact
  removes its items through the `contactId` foreign-key cascade, outside the
  pipeline mutation engine, so neither the counts cache nor open boards hear
  about it; the counts heal within the 60 s TTL and boards on their next
  refetch. The inbox panel uses
  `listViewable`, which reads only the rows.
- **Nothing is cached per contact or per item** (the platform targets 100M
  contacts): inbox panel, variables, flow step targets and filters all read
  Postgres through indexes.
- Indexes backing the reads: `PipelineItem_contact_status_idx`
  `(workspaceId, pipelineId, contactId, status, createdAt DESC)`,
  `PipelineItem_stage_createdAt_idx` `(pipelineId, stageId, createdAt DESC, id DESC)`
  (serves the board's per-stage `LATERAL … LIMIT` first page and "Load more"),
  `PipelineItem_pipeline_createdAt_idx` `(pipelineId, createdAt DESC, id DESC)`
  (pipeline-wide `listItems` in the default order),
  `PipelineItem_pipeline_id_idx` `(pipelineId, id)` (the field-key strip's
  keyset walk), `PipelineItem_contactId_idx`.

## Events, triggers and webhooks

Five trigger event types (`PIPELINE_EVENT_TYPES`):
`pipelineItemCreated`, `pipelineItemMovedToStage`, `pipelineItemValueChanged`,
`pipelineItemStatusChanged`, `pipelineItemPriorityChanged`. (They replace the
earlier `ticket*` trigger event names.)

They are **context-free** (`CONTEXT_FREE_EVENT_TYPE_SET`): a member moving a
card or an agent calling the API has no channel message, so outbound webhooks
receive them without the channel-originated context other events need.

Event metadata (`PipelineItemEventMetadata`, emitted through
`emitPipelineItemEvent`): `sourceId` (= pipeline id), `pipelineId`,
`pipelineName`, `pipelineReferenceName`, `itemId`, `itemNumber`, `title`,
`contactId`, `stageId`, `stageName`, `status`, `statusLabel`, `priority`,
`value`, `currency`, `dueDate` (ISO or null), `actorKind`, `actorUserId`, plus
per event: `fromStageId`/`fromStageName` (moved), `fromPipelineId` (transfer),
`previousStatus`, `previousValue`, `previousPriority`.

**Webhook payload** (`buildPipelineItemPayload`, event names
`pipeline_item_created`, `pipeline_item_moved_to_stage`,
`pipeline_item_value_changed`, `pipeline_item_status_changed`,
`pipeline_item_priority_changed`) is snake_case: `pipeline_id`,
`pipeline_name`, `pipeline_reference_name`, `item_id`, `item_number`, `title`,
`stage_id`, `stage_name`, `status`, `status_label`, `priority`, `value`,
`currency`, `due_date`, `actor_kind`, `actor_user_id`, and when applicable
`from_stage_id`, `from_stage_name`, `from_pipeline_id`, `previous_status`,
`previous_value`, `previous_priority`, on top of the base `event`,
`contact_id`, `timestamp`.

**Conditions.** A trigger or webhook condition of these types pins a pipeline
through `sourceId` (null = any pipeline); `pipelineItemMovedToStage` can also
pin the destination with `value.stageId`. `conditionListensToSource`
(`packages/events/src/event-type-registry.ts`) lets an **unpinned** pipeline
condition match any event source, while every other event type keeps its
previous behavior; the evaluator (`evaluatePipelineItem`) then applies the
pipeline and stage check.

**Flow-made changes fire triggers too.** Only the trigger executor runs in the
worker context that suppresses emission; flow steps run later in the
integration worker, so a Pipelines step that changes an item emits its event
and can start other triggers, exactly like a flow's Add Tag step. Loops stay
bounded because an unchanged attribute emits nothing (setting the same status
or priority again is silent), but a flow that flips an attribute that its own
trigger listens to (status A → B on "status changed") will keep re-running —
pin such triggers to a pipeline/stage or make the step idempotent.

**Realtime.** `pipelineItemChanged` (workspace delivery) carries
`{ pipelineId, itemId?, contactId?, change: created | updated | moved | deleted | bulk }`;
`itemId` and `contactId` are omitted for structure, settings and bulk changes.
The board refetches on any event of its pipeline (debounced, 2 s max wait);
the inbox panel refetches every pipeline query on screen for its contact's
items, a pipeline-wide change, or an event without `contactId` (older
publishers).
Pipeline settings updates and deletes also emit one, so open boards pick up a
new currency, status labels or visible features. A write of the workspace
target country emits one per pipeline of the workspace (see [Currency](#currency)). It carries no item data:
the client refetches through its authorised read.

## Flow step ("Pipelines")

`stepType: "pipeline"`, one step with 14 `action`s and three states
(success / error / skip): `addToPipeline`, `moveToStage`, `changeValue`,
`assign`, `changeStatus`, `changePriority`, `changeDueDate`, `changeTitle`,
`setCustomField`, `clearCustomField`, `changeDescription`,
`removeFromPipeline`, `addComment`, `transfer`. Text fields accept
`{{variables}}`; the due date is `none`, a contact date/datetime custom field
(a blank field clears it) or a fixed ISO instant. Keys deviate from the plan:
`pipelineFieldId` / `pipelineFieldIds`.

- **Target resolution.** Every action except `addToPipeline` acts on the
  contact's **most recently created OPEN item** in `pipelineId`
  (`pipelineItemService.resolveTargetForContact`). No open item routes to
  **skip**, not error.
- **Routing.** `runPipelineFlowAction` never throws for caller-fixable
  problems: missing pipeline or a validation/conflict/not-found failure ->
  `error`; missing target -> `skip`; success -> `success`. Unexpected failures
  (database down) propagate so the job retries. The reason is logged, never
  shown to the contact. Actor: `{kind: "flow", sourceId: flowId}`.
- **Deleted references.** A flow keeps working after something it names is
  deleted (`liveReferences` in `flow-actions.ts`, logged as a warning):
  `addToPipeline` still adds the item, leaving out deleted admins, teams and
  fields and using the first stage when its stage is gone; `assign` keeps the
  remaining assignees and errors only when none is left; `clearCustomField`
  skips deleted fields. A due date read from a deleted (or no longer date)
  contact field adds the item without a due date, while `changeDueDate` errors
  instead of clearing the item's date. A deleted pipeline, or the stage of
  `moveToStage` / `transfer`, still routes to `error`.
- **Dedup keys.** Only the actions that add something are deduplicated:
  `addToPipeline` and `addComment` get `idempotencyKey =
  "<flowExecutionKey>:<stepId>"`; a retried "set" is already idempotent. Without
  a `flowExecutionKey` there is no dedup.
- **Variables** are interpolated lazily per field; the contact's variables and
  pipeline items load once per variables context: `contactVariableService.getAll`
  attaches a lazy, memoized loader (`createContactPipelineItemsLoader`) that
  queries only when a `{{pipelines.*}}` token is first resolved.

### Authoring the step with FlowSpec (agents)

Agents do not hand-write nodes: the flow-spec DSL (`flows.create` /
`updateDraft` / `validate` / `publish` with `{ spec }`) has a `type: "pipeline"`
step that compiles to this step. It references things by what an agent can
discover (`pipelines.list` / `pipelines.get`), resolved at compile time from
`getFlowAuthoringContext` (one batched read of pipelines, stages and fields):

```json
{
  "type": "pipeline",
  "action": "moveToStage",
  "pipeline": "sales",
  "stage": "Won",
  "onError": [{ "type": "send", "text": "Could not update the deal" }],
  "onSkip": [{ "type": "pipeline", "action": "addToPipeline", "pipeline": "sales", "title": "{{full_name}}" }]
}
```

- `pipeline` / `destinationPipeline`: `referenceName` (or id). `stage` /
  `destinationStage`: stage **name** within that pipeline (ambiguous names are an
  error). `field`, `fields`, `fieldValues[].field`: pipeline field `referenceName`.
  `dueDate`: `{ mode: "none" }`, `{ mode: "fixed", at }` or
  `{ mode: "customField", customFieldName }` (contact date/datetime field).
- Assignees: `assigneeMemberIds` (`workspaceMembers.list`) and
  `assigneeInboxTeamIds` (`inboxTeams.list`).
- Per action, required fields are checked with spec paths and unused fields are
  rejected. `onSkip` is rejected for `addToPipeline` (`pipelineActionCanSkip`).
- Routing: success continues to the next spec step; `onError` / `onSkip` compile
  to the step's `error` / `skip` state handles. Errors:
  `unknownPipeline`, `unknownPipelineStage`, `ambiguousPipelineStage`,
  `unknownPipelineField` with the spec path and candidate names.

## Contact filter: `pipelineItem`

Condition shape: `field: "pipelineItem"`, `attribute`, `pipelineId`
(null = any pipeline), `operator`, `value`. Every shape is a workspace-scoped
correlated `EXISTS` over `PipelineItem`, or its `NOT EXISTS` twin for the
negative operators (`packages/database/src/queries/contact-filter/pipeline-item.ts`).

| attribute | operators | value | Notes |
|---|---|---|---|
| `exists` | `isNotEmpty`, `isEmpty` | `any` / `open` / `won` / `lost` | `isNotEmpty` = has an item (in that status); `isEmpty` = has none |
| `status` | `in`, `notIn` | non-empty list of statuses | |
| `priority` | `in`, `notIn` | non-empty list of priorities | |
| `stage` | `in`, `notIn` | 1-200 stage ids | **Requires** `pipelineId`; a stage of another pipeline matches nothing |

Semantics:

- `in` = **exists** an item (within the pipeline, or any when `pipelineId` is
  null) with one of the values.
- `notIn` and `isEmpty` = **NOT EXISTS** such an item, so a contact with **no
  items at all matches the negative operators**. Conditions on different
  attributes are independent: "status in open AND stage in X" can be satisfied
  by two different items of the contact.
- A saved condition that cannot be evaluated (bad operator, empty or malformed
  list, `stage` without a pipeline, over 200 ids, non-bigint id) **fails
  closed** (`FALSE`), so an audience never widens. All values are bound
  parameters.
- **Not available on `flowCondition`:** the Condition flow step cannot store
  pipeline conditions; `contacts.listFilterFields?surface=flowCondition`
  returns an empty `pipelineItems`. Everywhere else (contacts list/count,
  segments, broadcasts) discovery reports `pipelineItems` (pipelines, stages,
  condition shapes). The skill `.agents/skills/contact-filter/` documents the
  registration surface.
- Value labels for the filter chips resolve through the `pipelines` /
  `pipelineStages` lookups of `filter-value-labels`.

## Variables

`{{pipelines.<reference_name>.<attr>}}` (`PIPELINE_VARIABLE_ATTRIBUTES`):
`name` (item title), `stage_name`, `status` (the pipeline's label, e.g.
"Resolved"), `priority`, `value` (formatted with the pipeline's effective currency),
`assigned_admins` (names joined with `, `), `created_date`, `due_date`,
`updated_date` (formatted in the contact's timezone), `id`.

The reference name matches `^[a-z][a-z0-9_]{0,63}$` and must have exactly two
segments. The item read is the contact's **latest OPEN item in that pipeline,
else its latest item**; an unknown pipeline or a contact without an item yields
`""`. One query per render, started only if a pipeline variable is actually
used (`loadPipelineVariableTargets`, system context).

System field `{{last_opportunity_id}}` ("the ID of the last
opportunity updated or created") renders the id of the contact's most
recently **created or updated** item in **any** pipeline (`updatedAt desc, id
desc`), or `""` when the contact has none. It is a regular `systemFieldTypes`
entry resolved lazily by `loadLastPipelineItemId` (one indexed lookup on
`PipelineItem_contactId_idx`, only when the text uses it), and it is listed in
the variable picker under the system fields.

## Templates

Flow templates carry `manifests.pipelines` (keyed by source pipeline id):
`collectPipelineManifest` gathers the pipelines the exported flows reference,
directly or through a stage or custom field, and ships **every stage and field
of those pipelines** so install can match by name. Install
(`resolvePipelineManifest` -> `pipelineTemplateService.resolveTemplateEntry`)
find-or-creates by `referenceName`, matches stages by name (each existing stage at most once, so same-named template stages keep separate destinations) and fields by
`referenceName`, and fills the `pipeline`, `pipelineStage` and `pipelineField`
id maps; provenance is recorded under the existing `flows` category (no
template-category enum migration). Unmatched stages/fields are reported as
warnings (path `manifests.pipelines.<sourceId>`). Items, members and ACL never
travel.

Pipeline step **assignees are stripped** on import/export:
`assigneeMemberIds` (kind `workspaceMember`) and `assigneeInboxTeamIds` (kind
`inboxTeam`) have no id map because members and teams never move between
workspaces; they are reported and removed (`REFERENCE_ARRAY_FIELD_ENTITY_KIND`).

## Public API, CLI and MCP

Scope **`pipelines`** (`workspaceTokenAuthAPIForScope("pipelines")`), routers
`features/pipelines/api/public.ts` and `public-items.ts`, nested in
`routers/public.ts`. The signed-in builder uses the private router
`pipelinesAPI` over the same services. Test:
`apps/builder/__tests__/pipelines-public-scope.test.ts`.

| Operation | Method and path | MCP default |
|---|---|---|
| list | `GET /v1/pipelines` | yes |
| get | `GET /v1/pipelines/{id}` | |
| create / update / delete | `POST /v1/pipelines`, `PATCH`/`DELETE /v1/pipelines/{id}` | |
| duplicate | `POST /v1/pipelines/{id}/duplicate` (structure only, no items) | |
| createStage / updateStage / deleteStage | `POST /v1/pipelines/{id}/stages`, `PATCH`/`DELETE .../stages/{stageId}` | |
| reorderStages | `POST /v1/pipelines/{id}/stages/reorder` | |
| listFields / createField / updateField / deleteField | `GET`/`POST /v1/pipelines/{id}/fields`, `PATCH`/`DELETE .../fields/{fieldId}` | |
| listMembers / setMember / removeMember | `GET .../members`, `PUT`/`DELETE .../members/{workspaceMemberId}` | |
| getStats | `GET /v1/pipelines/{id}/stats` | |
| listItems | `GET /v1/pipelines/{id}/items` (filters mirror the board: `stageId`, `status`, `priority`, `assigneeMemberId`, `assigneeInboxTeamId` as comma-separated "any of" lists, contact, value, `fieldConditions` (JSON object keyed by field id, AND-ed) and/or one `fieldId`+`fieldOperator`+`fieldValue`/`fieldValueTo`, `timezone`, search, and `<name>From`/`<name>To` ranges for `due`, `created`, `updated`, `lastComment`, `statusChanged`, `stageEntered`, `wonClosed`, `lostClosed`; activity: `activityGroups` (comma-separated groups), `activityActor` (comma-separated workspace user ids from `workspaceMembers.list` `userId`, or `automation`), `activityFrom`/`activityTo`) | yes |
| stageTotals | `GET /v1/pipelines/{id}/stage-totals` — item count and total value per stage in board order (the board's column headers), with the same filters as `listItems` | no |
| getItem | `GET /v1/pipelines/{id}/items/{itemId}` | |
| createItem | `POST /v1/pipelines/{id}/items` (accepts `idempotencyKey`) | yes |
| updateItem / deleteItem | `PATCH`/`DELETE .../items/{itemId}` | |
| moveItem | `POST .../items/{itemId}/move` | yes |
| transferItem | `POST .../items/{itemId}/transfer` | |
| listComments / addComment / deleteComment | `.../comments` (list: newest first, 100 per page, `cursor` → `nextCursor`), `.../comments/{commentId}` | |
| addAttachment / removeAttachment | `POST .../attachments` (body `mediaLibraryFileId`, one file per call), `DELETE .../attachments/{mediaLibraryFileId}` | |
| listActivity | `GET .../items/{itemId}/activity` | |
| listContactItems | `GET /v1/contacts/{identifier}/pipeline-items` | |

31 operations. `listContactItems` lives under the contacts path but is a
`pipelines` operation. Attachments reference media-library files, so uploading
one also needs the `media` scope. A `deleteStage` above the inline limit
answers success with `queued: true` and a `jobId`.

**CLI.** The command name is derived from path and method; verbs that are not
sub-resources are overridden in `apps/cli/src/openapi-loader.ts`:
`pipelines:duplicate`, `pipelines:stages:reorder`, `pipelines:item:move`,
`pipelines:item:transfer`, `pipelines:stats`. Pinned in
`apps/cli/__tests__/openapi-loader-command-names.test.ts` (POST items is
`pipelines:item:add`, POST stages is `pipelines:stage:add`). Reference:
`apps/cli/README.md` ("pipelines"); MCP default tools:
`apps/mcp-server/README.md` ("Pipelines"); scope notes:
`docs/developer/workspace-api-tokens.md`.

Changes made through a token are attributed `actorKind: workspaceToken`.

## Analytics

`pipelineAnalyticsService.getStats` (`GET .../stats`,
`from`, `to`, optional `timezone`, default the workspace timezone) is
**transition-based**, read from `PipelineItemActivity`, not from the item's
current state:

- `created` counts `created` rows; `won`/`lost` count `statusChanged` rows whose
  `toStatus` is won/lost (an item created already closed counts as a
  transition too), with `toValue` = the item's value **at closure**, so reopening
  and re-closing counts twice and a later value edit never rewrites history.
- Days are bucketed in the requested timezone (`enumerateDateKeys` fills empty
  days); the response has `current`, the equal-length `previous` period, the
  percent `change` per metric, `daily` and `byActor`. Each `byActor` row has
  `actorKind`: `automation` groups flows, triggers, tokens and system changes
  (`actorUserId: null`); `user` rows carry the user id, which is null for a
  user whose account was deleted. The UI shows such rows, and members who left
  the workspace, as "Former member", like the item history does.
- Money is summed at four decimals and rounded to remove float drift.
- The UI draws the three created/won/lost-by-admin pies from `byActor` alone
  (`lib/admin-pie-model.ts`): the five most active actors take the categorical
  slots once, so an admin keeps one color in every pie; the rest fold into
  "Other".
- Index: `PipelineItemActivity_pipeline_kind_occurredAt_idx`.

## Limits (`PIPELINE_LIMITS`)

| Limit | Value |
|---|---|
| name | 120 |
| item title | 200 |
| description | 5000 |
| comment | 2000 |
| stage description | 300 |
| idempotency key | 128 |
| inline stage move/delete | 2000 items |
| queued stage job batch | 500 rows per transaction |
| assignees per item | 20 |
| stages per pipeline (also cap on stage-id arrays) | 200 |
| custom fields per pipeline (also cap on field values per write) | 100 |
| attachments per item (checked after the insert, under the item lock) | 50 |
| open items per contact | `settings.maxOpenItemsPerContact` (1-100, default none) |
| stage ids in a contact filter condition | 200 |

Colors must match `#rrggbb`, currency `^[A-Z]{3}$`.

## Operations

- **Migration.** One migration, `*_pipelines`, apply only with explicit
  approval (AGENTS.md). It first drops the pipeline tables and enums
  `IF EXISTS`, so a database that ran this branch's earlier pipeline migrations
  is rebuilt cleanly (their pipeline data is lost); on production every drop is
  a no-op. Deploy order: migrate, then worker + builder.
- **Stuck stage.** A stage with `bulkJobId` set and no live job is reclaimable
  one minute after the claim: repeat the delete. A live job answers
  `409 stageBusy`; inspect the `default` queue for `processPipelineStageBulk`
  jobs.
- **Effects are best-effort.** A missing trigger/webhook/realtime event after a
  successful write shows up as `Pipeline post-commit effect failed` in the
  logs (`effectKind`); there is no replay.
- **Workspace purge** drains `PipelineItemActivity` in batches as a
  partitioned table (`PARTITIONED_WORKSPACE_TABLES`), so the final workspace
  delete never cascades the whole history in one statement; items and their
  children go with the batched contact drain, the rest through the foreign
  keys.
- Realtime consumers refetch on `pipelineItemChanged`; a lost push heals on the
  next refetch or the 30 s query stale time.

## Known deviations and deferrals

- **Description is plain text** (a textarea), not rich text.
- **Won/lost labels** are per-pipeline display text; filters, variables and
  webhooks expose both the stable status and `statusLabel`.
- **Flow step keys** are `pipelineFieldId(s)`; templates ship as a
  `manifests.pipelines` block instead of a new template category.
- **Client invalidation is whole-key:** every pipeline mutation invalidates
  `orpc.pipelinesAPI.key()`, not per-resource keys.
- **A filter condition on a hidden feature or a deleted field stops applying**
  (`applicableFilter`); the board filter, search and sort live in the URL
  (`?filter=` is JSON validated by the same schema as the API, so an outdated
  link falls back to unfiltered).
- **Activity filter (board "Activity" section):** three rows after Custom
  fields: type of change (the activity groups), done by (workspace members by
  user id, plus Automation = flow/trigger/workspaceToken/system) and when
  (presets or a range, row id `activityWhen`). They form `activityMatch`:
  an item matches when ONE `PipelineItemActivity` row satisfies every set part
  (a single correlated `EXISTS`; who-did-it user/automation are OR-ed). Only
  rows with `pipelineId` equal to the item's current pipeline count, so
  history recorded before a transfer, possibly in a pipeline the viewer cannot
  see, never influences results. Served by
  `PipelineItemActivity_item_occurredAt_idx`; no migration. The public
  `listItems` exposes it as `activityGroups`, `activityActor`, `activityFrom`,
  `activityTo`.
- **Activity old → new values** are shown for stage, status, value, priority,
  due date and title; other kinds (comments, attachments, assignees, fields)
  show the change kind only, since bodies are never stored.
- **No pipeline conditions in the flow Condition step** (stored conditions
  there cannot express them).
- **Locales:** all 21 locales are translated.

## Item writes: concurrency, required fields, references

- Comment and attachment writes row-lock the item and re-check its pipeline
  before touching children, so they serialise with transfers and with each
  other (`lastCommentAt` is recomputed from the comments after the lock on both add and delete, so it never moves backwards; two concurrent deletes
  of the last two comments leave it null).
- An item update validates required custom fields **only for the keys in the
  patch**: untouched missing required fields never block an unrelated edit or
  filling sibling required fields one at a time, while clearing a required
  field is rejected. Create still validates all required fields. A transfer
  does not: destination fields the source has no value for (same reference
  name and type) start empty, like existing items when a required field is
  added; the next edit of that field enforces it.
- List filters reject ids past a signed bigint, dates outside 1900-2200 and
  NUL characters in text at the API boundary; the cursor error mapping
  (SQLSTATE 22xxx -> 422) only applies when a cursor was sent.
- Flow-step reference ids (`pipelineId`, `stageId`, `destinationPipelineId`,
  `destinationStageId`, assignee member/team ids, `pipelineFieldId(s)`) must be
  digit-only ids of at most 18 digits. The step schema rejects anything else;
  the only extra value allowed is the empty string where a picker may be left
  unset (`addToPipeline.stageId` and `transfer.destinationStageId` mean "first
  stage", and a fresh `setCustomField` has an empty field until configured,
  which the runtime reports as `error`). The runtime routes a malformed id to the `error` state before any
  query, so a bad id never causes a database cast error and a retry.
- Flow steps are at-least-once like their sibling steps. A retried
  non-idempotent step (for example close or delete) re-resolves the contact's
  latest open item, which may be a different item than the first attempt.
- The item drawer renders priority, value and due date only when
  `settings.visibleFeatures` enables them, and attachments open through the
  media library's public file URL.
