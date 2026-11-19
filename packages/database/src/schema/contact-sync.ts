import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ContactSyncActorType,
  type ContactSyncFollowUpError,
  type ContactSyncMappingKind,
  type ContactSyncMappingOrigin,
  type ContactSyncProvider,
  type ContactSyncRunItemStatus,
  type ContactSyncRunStatus,
  type ContactSyncSourceChannel,
  type ContactSyncTrigger,
  type ContactSyncTriggerSource,
  contactSyncActorTypes,
  contactSyncMappingKinds,
  contactSyncMappingOrigins,
  contactSyncProviders,
  contactSyncRunItemStatuses,
  contactSyncRunStatuses,
  contactSyncSourceChannels,
  contactSyncTriggerSources,
  contactSyncTriggers,
} from "../partials/contact-sync"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { customFieldModel } from "./custom-field"
import { inboxModel } from "./inbox"
import { tagModel } from "./tag"
import { workspaceModel } from "./workspace"

export const contactSyncProviderEnum = pgEnum(
  "contactSyncProvider",
  contactSyncProviders.options as [
    ContactSyncProvider,
    ...ContactSyncProvider[],
  ],
)

export const contactSyncTriggerSourceEnum = pgEnum(
  "contactSyncTriggerSource",
  contactSyncTriggerSources.options as [
    ContactSyncTriggerSource,
    ...ContactSyncTriggerSource[],
  ],
)

export const contactSyncTriggerEnum = pgEnum(
  "contactSyncTrigger",
  contactSyncTriggers.options as [ContactSyncTrigger, ...ContactSyncTrigger[]],
)

export const contactSyncActorTypeEnum = pgEnum(
  "contactSyncActorType",
  contactSyncActorTypes.options as [
    ContactSyncActorType,
    ...ContactSyncActorType[],
  ],
)

export const contactSyncSourceChannelEnum = pgEnum(
  "contactSyncSourceChannel",
  contactSyncSourceChannels.options as [
    ContactSyncSourceChannel,
    ...ContactSyncSourceChannel[],
  ],
)

export const contactSyncRunStatusEnum = pgEnum(
  "contactSyncRunStatus",
  contactSyncRunStatuses.options as [
    ContactSyncRunStatus,
    ...ContactSyncRunStatus[],
  ],
)

export const contactSyncRunItemStatusEnum = pgEnum(
  "contactSyncRunItemStatus",
  contactSyncRunItemStatuses.options as [
    ContactSyncRunItemStatus,
    ...ContactSyncRunItemStatus[],
  ],
)

export const contactSyncMappingKindEnum = pgEnum(
  "contactSyncMappingKind",
  contactSyncMappingKinds.options as [
    ContactSyncMappingKind,
    ...ContactSyncMappingKind[],
  ],
)

export const contactSyncMappingOriginEnum = pgEnum(
  "contactSyncMappingOrigin",
  contactSyncMappingOrigins.options as [
    ContactSyncMappingOrigin,
    ...ContactSyncMappingOrigin[],
  ],
)

/**
 * One import of contacts from an external system into a workspace. Executed
 * as short chunk jobs; this row is the lease, the options and the history.
 * At most one live run per workspace, whatever the provider. No `.default()`
 * on purpose: every insert writes every column.
 */
export const contactSyncRunModel = pgTable(
  "ContactSyncRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: contactSyncProviderEnum().notNull(),
    status: contactSyncRunStatusEnum().notNull(),
    triggerSource: contactSyncTriggerSourceEnum().notNull(),
    // Why the run exists; `connect` runs skip the menu cooldown and never start it.
    trigger: contactSyncTriggerEnum().notNull(),
    // Who asked, kept as a snapshot (no FK) so it survives deleting the user or
    // the API token: it is the `actor` of every signed export request of the run.
    requestedByType: contactSyncActorTypeEnum().notNull(),
    requestedById: text().notNull(),
    syncTags: boolean().notNull(),
    syncCustomFields: boolean().notNull(),
    // false = only fill what the contact is missing; true = source values win.
    // An empty source value never clears workspace data in either mode.
    overwriteExisting: boolean().notNull(),
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
    lastHeartbeatAt: timestamp(timestampConfig),
    // The source asked to wait (rate limit): nothing may claim or re-dispatch
    // the run before this. A cancel bypasses it. NULL = not paused.
    pausedUntil: timestamp(timestampConfig),
    // Exclusive lease token, re-minted by every claim; every write a claim
    // holder makes is conditional on it. NULL = released / never claimed.
    claimToken: text(),
    // Sweeper dispatches burned (a continuation chunk is not an attempt).
    attempts: integer().notNull(),
    // Monotonic continuation revision; makes each chunk job id unique.
    chunkSeq: integer().notNull(),
    currentError: text(),
  },
  (t) => [
    // One live run per workspace, across providers.
    uniqueIndex("ContactSyncRun_workspace_live_uq")
      .on(t.workspaceId)
      .where(sql`status IN ('pending', 'running', 'cancelling')`),
    // Cooldown and history lookups; also the leading index of the workspace FK.
    index("ContactSyncRun_workspace_createdAt_idx").on(
      t.workspaceId,
      sql`${t.createdAt} DESC`,
    ),
    index("ContactSyncRun_live_idx")
      .on(t.status, t.lastHeartbeatAt)
      .where(sql`status IN ('pending', 'running', 'cancelling')`),
  ],
)

/**
 * One source (e.g. one external page) of a run, imported into one inbox.
 * Items of a run are processed one at a time in `position` order; `cursor`
 * is the source's opaque resume point and `upperBoundId` the snapshot bound
 * fixed when the item starts, so each item is a finite set.
 */
export const contactSyncRunItemModel = pgTable(
  "ContactSyncRunItem",
  {
    ...sharedColumns,
    runId: bigintAsString()
      .notNull()
      .references(() => contactSyncRunModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // `set null` so disconnecting the page or deleting the inbox keeps the history.
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // The page on the platform; with the channel it names the AhaChat page.
    sourceChannel: contactSyncSourceChannelEnum().notNull(),
    sourceAccountId: text().notNull(),
    // Display snapshot of the source, kept after a disconnect.
    sourceAccountName: text(),
    position: integer().notNull(),
    status: contactSyncRunItemStatusEnum().notNull(),
    cursor: text(),
    // The newest source contact id at the first claim; the item imports ids up to it.
    upperBoundId: text(),
    // Set once the bound was read, so "not read yet" differs from "empty source".
    boundReadAt: timestamp(timestampConfig),
    createdCount: integer().notNull(),
    updatedCount: integer().notNull(),
    skippedCount: integer().notNull(),
    failedCount: integer().notNull(),
    // Custom-field values dropped: incompatible mapping or an invalid value.
    skippedValueCount: integer().notNull(),
    currentError: text(),
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
    // Connect import only: run the normal history sync (coexist) once this
    // import ended, whatever its outcome. Handed off durably by the worker.
    followUpCoexist: boolean().notNull(),
    followUpAiReadsSyncedHistory: boolean().notNull(),
    // The coexist run the handoff created or reused; NULL until handed off.
    followUpRunId: bigintAsString(),
    // Why the handoff will not happen (cancelled, channelUnavailable, ...).
    followUpError: text().$type<ContactSyncFollowUpError>(),
    // Start of the 24 h window the handoff may still be retried in.
    followUpRequestedAt: timestamp(timestampConfig),
  },
  (t) => [
    uniqueIndex("ContactSyncRunItem_runId_position_key").on(
      t.runId,
      t.position,
    ),
    index("ContactSyncRunItem_workspaceId_idx").on(t.workspaceId),
    index("ContactSyncRunItem_inboxId_idx")
      .on(t.inboxId)
      .where(sql`${t.inboxId} IS NOT NULL`),
    // The follow-up sweep: closed items still owing a coexist handoff.
    index("ContactSyncRunItem_followUp_pending_idx")
      .on(t.followUpRequestedAt)
      .where(
        sql`${t.followUpCoexist} AND ${t.followUpRunId} IS NULL AND ${t.followUpError} IS NULL AND ${t.status} NOT IN ('pending', 'running')`,
      ),
  ],
)

/**
 * A page-side tag or custom field and what it maps to in the workspace.
 * `manual` rows come from the user; `auto` rows are written by a run (never
 * over a manual row) so later runs reuse the same target. Deleting the target
 * removes the mapping, so the next run resolves it again.
 */
export const contactSyncMappingModel = pgTable(
  "ContactSyncMapping",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: contactSyncProviderEnum().notNull(),
    // The AhaChat page the mapping belongs to. No FK: mappings outlive a page
    // disconnect so a reconnect keeps them; the workspace purge removes them.
    channel: contactSyncSourceChannelEnum().notNull(),
    pageId: text().notNull(),
    kind: contactSyncMappingKindEnum().notNull(),
    externalId: text().notNull(),
    externalName: text().notNull(),
    tagId: bigintAsString().references(() => tagModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    customFieldId: bigintAsString().references(() => customFieldModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    origin: contactSyncMappingOriginEnum().notNull(),
  },
  (t) => [
    uniqueIndex("ContactSyncMapping_page_kind_externalId_key").on(
      t.workspaceId,
      t.provider,
      t.channel,
      t.pageId,
      t.kind,
      t.externalId,
    ),
    index("ContactSyncMapping_tagId_idx")
      .on(t.tagId)
      .where(sql`${t.tagId} IS NOT NULL`),
    index("ContactSyncMapping_customFieldId_idx")
      .on(t.customFieldId)
      .where(sql`${t.customFieldId} IS NOT NULL`),
    check(
      "ContactSyncMapping_target_check",
      sql`(${t.kind} = 'tag' AND ${t.tagId} IS NOT NULL AND ${t.customFieldId} IS NULL) OR (${t.kind} = 'customField' AND ${t.customFieldId} IS NOT NULL AND ${t.tagId} IS NULL)`,
    ),
    check(
      "ContactSyncMapping_external_check",
      sql`btrim(${t.externalId}) <> '' AND btrim(${t.externalName}) <> ''`,
    ),
  ],
)
