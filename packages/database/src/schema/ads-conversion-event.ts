import { sql } from "drizzle-orm"
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  adsConversionChannel,
  adsConversionEventType,
} from "./ads-conversion-rule"
import { contactInboxModel } from "./contact-inbox"
import { integrationInstagramModel } from "./integration-instagram"
import { integrationMessengerModel } from "./integration-messenger"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const adsConversionEventSourceValues = [
  "automatic",
  "rule",
  "trigger",
] as const
export const adsConversionCapiStatusValues = [
  "pending",
  "sent",
  "failed",
  "skipped_no_scope",
  "skipped_region",
] as const

export const adsConversionEventSourceSchema = z.enum(
  adsConversionEventSourceValues,
)
export type AdsConversionEventSource = z.infer<
  typeof adsConversionEventSourceSchema
>

export const adsConversionCapiStatusSchema = z.enum(
  adsConversionCapiStatusValues,
)
export type AdsConversionCapiStatus = z.infer<
  typeof adsConversionCapiStatusSchema
>

export const adsConversionEventSource = pgEnum(
  "adsConversionEventSource",
  adsConversionEventSourceValues,
)

export const adsConversionCapiStatus = pgEnum(
  "adsConversionCapiStatus",
  adsConversionCapiStatusValues,
)

export const adsConversionEventModel = pgTable(
  "AdsConversionEvent",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: adsConversionChannel().notNull().default("whatsapp"),
    // WhatsApp-only attribution columns; nullable now that non-WhatsApp
    // channels are supported. Enforced NOT NULL for channel="whatsapp" rows
    // via the AdsConversionEvent_channel_integration_check constraint below.
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    integrationMessengerId: bigintAsString().references(
      () => integrationMessengerModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    // integrationInstagramModel backs BOTH the native Instagram login
    // integration and the Instagram-via-Facebook-Page integration.
    integrationInstagramId: bigintAsString().references(
      () => integrationInstagramModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    wabaId: text(),
    source: adsConversionEventSource().notNull(),
    eventType: adsConversionEventType().notNull(),
    ctwaClid: text(),
    adId: text(),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    currency: text(),
    value: numeric(),
    occurredAt: timestamp(timestampConfig).notNull(),
    sourceEventId: text().notNull(),
    capiStatus: adsConversionCapiStatus().notNull().default("pending"),
    capiSentAt: timestamp(timestampConfig),
  },
  (table) => [
    // LEGACY, kept only for rolling-deploy compatibility: worker binaries
    // built before the channel generalization issue
    // `ON CONFLICT ("workspaceId","integrationWhatsappId","source","sourceEventId")`,
    // which is only inferable from this exact (non-partial) unique index —
    // dropping it while old binaries still run would fail every CTWA event
    // insert until the new code finishes deploying. It cannot conflict with
    // the partial indexes below (messenger/instagram rows carry a NULL
    // `integrationWhatsappId`, and NULLs never collide in Postgres
    // uniqueness). Drop it in a follow-up migration once pre-generalization
    // binaries are fully drained.
    uniqueIndex(
      "AdsConversionEvent_workspace_integration_source_sourceEventId_key",
    ).on(
      table.workspaceId,
      table.integrationWhatsappId,
      table.source,
      table.sourceEventId,
    ),
    // Supersedes the legacy unique index above with one partial unique index
    // per channel. With nullable per-channel integration columns, a plain
    // composite unique index would never dedupe (NULL != NULL in Postgres
    // uniqueness), so each index is scoped to its channel and keyed on that
    // channel's own integration column.
    uniqueIndex("AdsConversionEvent_ws_whatsapp_source_sourceEventId_key")
      .on(
        table.workspaceId,
        table.integrationWhatsappId,
        table.source,
        table.sourceEventId,
      )
      .where(sql`${table.channel} = 'whatsapp'`),
    uniqueIndex("AdsConversionEvent_ws_messenger_source_sourceEventId_key")
      .on(
        table.workspaceId,
        table.integrationMessengerId,
        table.source,
        table.sourceEventId,
      )
      .where(sql`${table.channel} = 'messenger'`),
    uniqueIndex("AdsConversionEvent_ws_instagram_source_sourceEventId_key")
      .on(
        table.workspaceId,
        table.integrationInstagramId,
        table.source,
        table.sourceEventId,
      )
      .where(sql`${table.channel} = 'instagram'`),
    // Enforces that the integration/attribution columns actually match the
    // declared channel, so a mis-set channel can never bypass the partial
    // unique indexes above (Codex review HIGH#1).
    check(
      "AdsConversionEvent_channel_integration_check",
      sql`(${table.channel} = 'whatsapp' AND ${table.integrationWhatsappId} IS NOT NULL AND ${table.ctwaClid} IS NOT NULL AND ${table.wabaId} IS NOT NULL) OR (${table.channel} = 'messenger' AND ${table.integrationMessengerId} IS NOT NULL) OR (${table.channel} = 'instagram' AND ${table.integrationInstagramId} IS NOT NULL)`,
    ),
    index("AdsConversionEvent_workspaceId_eventType_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.eventType.asc().nullsLast(),
      table.occurredAt.asc().nullsLast(),
    ),
    index("AdsConversionEvent_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("AdsConversionEvent_workspaceId_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.occurredAt.asc().nullsLast(),
    ),
    index("AdsConversionEvent_workspaceId_adId_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.adId.asc().nullsLast(),
      table.occurredAt.asc().nullsLast(),
    ),
  ],
)
