import {
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
import { adsConversionEventType } from "./ads-conversion-rule"
import { contactInboxModel } from "./contact-inbox"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const adsConversionEventSourceValues = ["automatic", "rule"] as const
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
    integrationWhatsappId: bigintAsString()
      .notNull()
      .references(() => integrationWhatsappModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    wabaId: text().notNull(),
    source: adsConversionEventSource().notNull(),
    eventType: adsConversionEventType().notNull(),
    ctwaClid: text().notNull(),
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
    uniqueIndex(
      "AdsConversionEvent_workspace_integration_source_sourceEventId_key",
    ).on(
      table.workspaceId,
      table.integrationWhatsappId,
      table.source,
      table.sourceEventId,
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
