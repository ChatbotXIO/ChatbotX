import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { CustomFieldType } from "../partials"
import {
  type PipelineActivityKind,
  type PipelineActorKind,
  type PipelineItemPriority,
  type PipelineItemStatus,
  type PipelineSettings,
  type PipelineType,
  pipelineActivityKinds,
  pipelineActorKinds,
  pipelineItemPriorities,
  pipelineItemStatuses,
  pipelineTypes,
} from "../partials/pipeline"
import {
  bigintAsString,
  money,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { customFieldType } from "./custom-field"
import { inboxTeamModel } from "./inbox-team"
import { mediaLibraryFileModel } from "./media-library-file"
import { workspaceModel } from "./workspace"
import { workspaceMemberModel } from "./workspace-member"

export const pipelineTypeEnum = pgEnum(
  "pipelineType",
  pipelineTypes.options as [PipelineType, ...PipelineType[]],
)
export const pipelineItemStatusEnum = pgEnum(
  "pipelineItemStatus",
  pipelineItemStatuses.options as [PipelineItemStatus, ...PipelineItemStatus[]],
)
export const pipelineItemPriorityEnum = pgEnum(
  "pipelineItemPriority",
  pipelineItemPriorities.options as [
    PipelineItemPriority,
    ...PipelineItemPriority[],
  ],
)
export const pipelineActivityKindEnum = pgEnum(
  "pipelineActivityKind",
  pipelineActivityKinds.options as [
    PipelineActivityKind,
    ...PipelineActivityKind[],
  ],
)
export const pipelineActorKindEnum = pgEnum(
  "pipelineActorKind",
  pipelineActorKinds.options as [PipelineActorKind, ...PipelineActorKind[]],
)

const workspaceIdColumn = () =>
  bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })

const cascadeFk = { onDelete: "cascade", onUpdate: "cascade" } as const
const setNullFk = { onDelete: "set null", onUpdate: "cascade" } as const

export const pipelineModel = pgTable(
  "Pipeline",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    name: text().notNull(),
    type: pipelineTypeEnum().notNull(),
    referenceName: text().notNull(),
    currency: text().notNull(),
    // No `.default()`: drizzle-kit drops jsonb defaults, so callers always
    // write the full parsed value (see AGENTS.md on jsonb defaults).
    settings: jsonb().$type<PipelineSettings>().notNull(),
    createdById: bigintAsString().references(() => userModel.id, setNullFk),
  },
  (table) => [
    uniqueIndex("Pipeline_workspaceId_referenceName_key").on(
      table.workspaceId,
      table.referenceName,
    ),
    uniqueIndex("Pipeline_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)

export const pipelineStageModel = pgTable(
  "PipelineStage",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    pipelineId: bigintAsString()
      .notNull()
      .references(() => pipelineModel.id, cascadeFk),
    name: text().notNull(),
    description: text(),
    textColor: text(),
    backgroundColor: text(),
    position: integer().notNull(),
    // Set while a queued bulk operation owns the column.
    bulkJobId: text(),
  },
  (table) => [
    index("PipelineStage_pipelineId_position_idx").on(
      table.pipelineId,
      table.position,
    ),
  ],
)

/** Last item number per workspace; mirrors `EcommerceOrderCounter`. */
export const pipelineItemCounterModel = pgTable("PipelineItemCounter", {
  workspaceId: bigintAsString()
    .primaryKey()
    .references(() => workspaceModel.id, cascadeFk),
  lastNumber: bigint({ mode: "number" }).default(0).notNull(),
})

export const pipelineItemModel = pgTable(
  "PipelineItem",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    pipelineId: bigintAsString()
      .notNull()
      .references(() => pipelineModel.id, cascadeFk),
    stageId: bigintAsString()
      .notNull()
      .references(() => pipelineStageModel.id, cascadeFk),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, cascadeFk),
    number: bigint({ mode: "number" }).notNull(),
    title: text().notNull(),
    description: text(),
    value: money(),
    status: pipelineItemStatusEnum().notNull(),
    priority: pipelineItemPriorityEnum().notNull(),
    dueDate: timestamp(timestampConfig),
    // Record<PipelineField id, stored string>; callers always write it.
    fieldValues: jsonb().$type<Record<string, string>>().notNull(),
    createdById: bigintAsString().references(() => userModel.id, setNullFk),
    closedById: bigintAsString().references(() => userModel.id, setNullFk),
    stageEnteredAt: timestamp(timestampConfig).notNull(),
    statusChangedAt: timestamp(timestampConfig),
    // Current closure only; null while open. History lives in activity rows.
    closedAt: timestamp(timestampConfig),
    lastCommentAt: timestamp(timestampConfig),
    idempotencyKey: text(),
  },
  (table) => [
    uniqueIndex("PipelineItem_workspaceId_number_key").on(
      table.workspaceId,
      table.number,
    ),
    uniqueIndex("PipelineItem_pipeline_idempotencyKey_key")
      .on(table.workspaceId, table.pipelineId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("PipelineItem_contact_status_idx").on(
      table.workspaceId,
      table.pipelineId,
      table.contactId,
      table.status,
      sql`${table.createdAt} DESC`,
    ),
    index("PipelineItem_stage_createdAt_idx").on(
      table.pipelineId,
      table.stageId,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`,
    ),
    // Pipeline-wide lists (no stage) in the default newest-first order.
    index("PipelineItem_pipeline_createdAt_idx").on(
      table.pipelineId,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`,
    ),
    // Keyset walks by id within one pipeline (field-key strip).
    index("PipelineItem_pipeline_id_idx").on(table.pipelineId, table.id),
    index("PipelineItem_contactId_idx").on(table.contactId),
    // Leading FK columns: stage cascades and user deletes must not scan.
    index("PipelineItem_stageId_idx").on(table.stageId),
    index("PipelineItem_createdById_idx")
      .on(table.createdById)
      .where(sql`${table.createdById} IS NOT NULL`),
    index("PipelineItem_closedById_idx")
      .on(table.closedById)
      .where(sql`${table.closedById} IS NOT NULL`),
  ],
)

export const pipelineItemAssigneeModel = pgTable(
  "PipelineItemAssignee",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    itemId: bigintAsString()
      .notNull()
      .references(() => pipelineItemModel.id, cascadeFk),
    workspaceMemberId: bigintAsString().references(
      () => workspaceMemberModel.id,
      cascadeFk,
    ),
    inboxTeamId: bigintAsString().references(
      () => inboxTeamModel.id,
      cascadeFk,
    ),
  },
  (table) => [
    check(
      "PipelineItemAssignee_one_target_check",
      sql`(${table.workspaceMemberId} IS NULL) <> (${table.inboxTeamId} IS NULL)`,
    ),
    uniqueIndex("PipelineItemAssignee_item_member_key").on(
      table.itemId,
      table.workspaceMemberId,
    ),
    uniqueIndex("PipelineItemAssignee_item_team_key").on(
      table.itemId,
      table.inboxTeamId,
    ),
    index("PipelineItemAssignee_member_idx").on(
      table.workspaceId,
      table.workspaceMemberId,
    ),
    index("PipelineItemAssignee_team_idx").on(
      table.workspaceId,
      table.inboxTeamId,
    ),
    // Leading FK columns for member / team delete cascades.
    index("PipelineItemAssignee_workspaceMemberId_idx")
      .on(table.workspaceMemberId)
      .where(sql`${table.workspaceMemberId} IS NOT NULL`),
    index("PipelineItemAssignee_inboxTeamId_idx")
      .on(table.inboxTeamId)
      .where(sql`${table.inboxTeamId} IS NOT NULL`),
  ],
)

export const pipelineItemCommentModel = pgTable(
  "PipelineItemComment",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    itemId: bigintAsString()
      .notNull()
      .references(() => pipelineItemModel.id, cascadeFk),
    text: text().notNull(),
    createdById: bigintAsString().references(() => userModel.id, setNullFk),
    idempotencyKey: text(),
  },
  (table) => [
    index("PipelineItemComment_item_createdAt_idx").on(
      table.itemId,
      sql`${table.createdAt} DESC`,
    ),
    index("PipelineItemComment_createdById_idx")
      .on(table.createdById)
      .where(sql`${table.createdById} IS NOT NULL`),
    uniqueIndex("PipelineItemComment_item_idempotencyKey_key")
      .on(table.workspaceId, table.itemId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
)

export const pipelineItemAttachmentModel = pgTable(
  "PipelineItemAttachment",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    itemId: bigintAsString()
      .notNull()
      .references(() => pipelineItemModel.id, cascadeFk),
    // Deleting the shared media file intentionally detaches it everywhere.
    mediaLibraryFileId: bigintAsString()
      .notNull()
      .references(() => mediaLibraryFileModel.id, cascadeFk),
  },
  (table) => [
    uniqueIndex("PipelineItemAttachment_item_file_key").on(
      table.itemId,
      table.mediaLibraryFileId,
    ),
    index("PipelineItemAttachment_mediaLibraryFileId_idx").on(
      table.mediaLibraryFileId,
    ),
  ],
)

/**
 * Append-only history. `itemId`/`contactId` carry no FK so rows survive item
 * and contact deletion; analytics are per pipeline, so deleting the pipeline
 * is the only cascade. Description/field/comment bodies are never stored.
 */
export const pipelineItemActivityModel = pgTable(
  "PipelineItemActivity",
  {
    id: sharedColumns.id,
    workspaceId: workspaceIdColumn(),
    pipelineId: bigintAsString()
      .notNull()
      .references(() => pipelineModel.id, cascadeFk),
    itemId: bigintAsString().notNull(),
    itemNumber: bigint({ mode: "number" }).notNull(),
    itemTitle: text().notNull(),
    contactId: bigintAsString().notNull(),
    kind: pipelineActivityKindEnum().notNull(),
    actorKind: pipelineActorKindEnum().notNull(),
    actorUserId: bigintAsString().references(() => userModel.id, setNullFk),
    // Workspace token id, flow id or trigger id, depending on `actorKind`.
    actorSourceId: text(),
    fromStageId: bigintAsString(),
    toStageId: bigintAsString(),
    fromStatus: pipelineItemStatusEnum(),
    toStatus: pipelineItemStatusEnum(),
    fromValue: money(),
    toValue: money(),
    fromPriority: pipelineItemPriorityEnum(),
    toPriority: pipelineItemPriorityEnum(),
    fromDueDate: timestamp(timestampConfig),
    toDueDate: timestamp(timestampConfig),
    fromTitle: text(),
    toTitle: text(),
    // Set on `transferred`: the pipeline the item left.
    fromPipelineId: bigintAsString(),
    version: integer().notNull().default(1),
    occurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    index("PipelineItemActivity_pipeline_kind_occurredAt_idx").on(
      table.workspaceId,
      table.pipelineId,
      table.kind,
      table.occurredAt,
    ),
    index("PipelineItemActivity_item_occurredAt_idx").on(
      table.workspaceId,
      table.itemId,
      sql`${table.occurredAt} DESC`,
    ),
    // Leading FK columns: pipeline cascade and user delete.
    index("PipelineItemActivity_pipelineId_idx").on(table.pipelineId),
    index("PipelineItemActivity_actorUserId_idx")
      .on(table.actorUserId)
      .where(sql`${table.actorUserId} IS NOT NULL`),
  ],
)

export const pipelineFieldModel = pgTable(
  "PipelineField",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    pipelineId: bigintAsString()
      .notNull()
      .references(() => pipelineModel.id, cascadeFk),
    name: text().notNull(),
    referenceName: text().notNull(),
    type: customFieldType().$type<CustomFieldType>().notNull(),
    required: boolean().notNull().default(false),
    position: integer().notNull(),
  },
  (table) => [
    uniqueIndex("PipelineField_pipelineId_referenceName_key").on(
      table.pipelineId,
      table.referenceName,
    ),
  ],
)

export const pipelineMemberModel = pgTable(
  "PipelineMember",
  {
    ...sharedColumns,
    workspaceId: workspaceIdColumn(),
    pipelineId: bigintAsString()
      .notNull()
      .references(() => pipelineModel.id, cascadeFk),
    workspaceMemberId: bigintAsString()
      .notNull()
      .references(() => workspaceMemberModel.id, cascadeFk),
    canManageSettings: boolean().notNull().default(false),
    canView: boolean().notNull().default(true),
    canEdit: boolean().notNull().default(false),
    canDelete: boolean().notNull().default(false),
  },
  (table) => [
    uniqueIndex("PipelineMember_pipeline_member_key").on(
      table.pipelineId,
      table.workspaceMemberId,
    ),
    index("PipelineMember_member_idx").on(
      table.workspaceId,
      table.workspaceMemberId,
    ),
  ],
)
