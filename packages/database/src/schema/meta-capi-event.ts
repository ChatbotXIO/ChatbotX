import type {
  MetaCapiActionSource,
  MetaCapiContentType,
  MetaCapiEventName,
} from "@chatbotx.io/utils/meta-capi"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  numeric,
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
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export {
  type MetaCapiActionSource,
  type MetaCapiContentType,
  type MetaCapiEventName,
  metaCapiActionSourceSchema,
  metaCapiActionSourceValues,
  metaCapiContentTypeSchema,
  metaCapiContentTypeValues,
  metaCapiEventNameSchema,
} from "@chatbotx.io/utils/meta-capi"

export const metaCapiEventChannelValues = [
  "messenger",
  "instagram",
  "whatsapp",
] as const
export const metaCapiEventSourceValues = [
  "flowStep",
  "triggerAction",
  // "Send test event" from the CAPI settings tab — only ever sent with a
  // test_event_code, never as a production event.
  "manualTest",
] as const
export const metaCapiStatusValues = [
  "pending",
  "sent",
  "failed",
  "skipped_no_scope",
  "skipped_disconnected",
  // WhatsApp business-messaging CAPI requires a ctwa_clid (click-to-WhatsApp
  // ad identifier). Contacts that did not arrive via a CTWA ad have none —
  // this is a Meta constraint, not a transient failure, so it is terminal.
  "skipped_no_identity",
] as const

export const metaCapiEventChannelSchema = z.enum(metaCapiEventChannelValues)
export type MetaCapiEventChannel = z.infer<typeof metaCapiEventChannelSchema>

export const metaCapiEventSourceSchema = z.enum(metaCapiEventSourceValues)
export type MetaCapiEventSource = z.infer<typeof metaCapiEventSourceSchema>

export const metaCapiStatusSchema = z.enum(metaCapiStatusValues)
export type MetaCapiStatus = z.infer<typeof metaCapiStatusSchema>

export const metaCapiEventModel = pgTable(
  "MetaCapiEvent",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: text().$type<MetaCapiEventChannel>().notNull(),
    // Separate from AdsConversionEvent because that table powers WhatsApp CTWA
    // analytics through non-nullable WhatsApp-specific attribution columns.
    // Polymorphic reference: `channel` discriminates which integration table
    // this id belongs to, so no FK — disconnect flows delete events explicitly.
    integrationId: bigintAsString().notNull(),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    eventName: text().$type<MetaCapiEventName>().notNull(),
    currency: text(),
    contentCategory: text(),
    contentName: text(),
    value: numeric(),
    // Meta CAPI `action_source` — see `metaCapiActionSourcePolicy` in
    // `@chatbotx.io/utils/meta-capi` for how each value drives identity and
    // event-catalog selection. Defaulted so existing rows (and existing
    // steps/actions parsing through zod `.default()`) stay `business_messaging`.
    actionSource: text()
      .$type<MetaCapiActionSource>()
      .notNull()
      .default("business_messaging"),
    contentType: text().$type<MetaCapiContentType>(),
    contentIds: jsonb().$type<string[]>(),
    source: text().$type<MetaCapiEventSource>().notNull(),
    sourceKey: text().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    capiStatus: text().$type<MetaCapiStatus>().notNull().default("pending"),
    capiSentAt: timestamp(timestampConfig),
    capiError: text(),
  },
  (table) => [
    uniqueIndex("MetaCapiEvent_workspaceId_channel_sourceKey_key").on(
      table.workspaceId,
      table.channel,
      table.sourceKey,
    ),
    index("MetaCapiEvent_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("MetaCapiEvent_channel_integrationId_idx").using(
      "btree",
      table.channel.asc().nullsLast(),
      table.integrationId.asc().nullsLast(),
    ),
    check(
      "MetaCapiEvent_channel_check",
      sql`"channel" IN ('messenger', 'instagram', 'whatsapp')`,
    ),
    check(
      "MetaCapiEvent_actionSource_check",
      sql`"actionSource" IN ('business_messaging', 'email', 'phone_call', 'chat', 'physical_store', 'system_generated', 'other')`,
    ),
    check(
      "MetaCapiEvent_contentType_check",
      sql`"contentType" IN ('product', 'product_group')`,
    ),
  ],
)
