import { sql } from "drizzle-orm"
import { check, index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core"
import {
  type MessagingAdOperationInput,
  messagingAdChannelTypes,
  messagingAdCreateStateValues,
  messagingAdPublishStateValues,
} from "../partials/messaging-ad"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { integrationInstagramModel } from "./integration-instagram"
import { integrationMessengerModel } from "./integration-messenger"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const messagingAdChannel = pgEnum(
  "messagingAdChannel",
  messagingAdChannelTypes.options as [string, ...string[]],
)

export const messagingAdCreateState = pgEnum(
  "messagingAdCreateState",
  messagingAdCreateStateValues,
)

export const messagingAdPublishState = pgEnum(
  "messagingAdPublishState",
  messagingAdPublishStateValues,
)

/**
 * Durable operation record for the in-app messaging-ads manager
 * (out/plan/ctm-ctid-ads-manager.md "Durable operation model"). Meta is NOT
 * transactional across campaign/ad set/creative/ad creates, so this row is
 * persisted BEFORE the first Graph POST and owns the retry: its `id` IS the
 * `operationId` embedded in every created Meta object's `name`
 * (`[cbx:{id}]`), so a resumed/retried operation can reconcile-by-query
 * against Meta instead of blind-retrying.
 *
 * Meta remains the source of truth for budget/targeting/creative/status —
 * this table is NOT a mirror of that data. `input` is a snapshot of the
 * validated wizard submission, kept only so a retry can replay the exact
 * create payload without re-asking the user.
 */
export const messagingAdOperationModel = pgTable(
  "MessagingAdOperation",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: messagingAdChannel().notNull(),
    // Exactly one of these three is set, matching `channel` — enforced by
    // the check constraint below (mirrors AdsConversionEvent's pattern).
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    integrationMessengerId: bigintAsString().references(
      () => integrationMessengerModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    integrationInstagramId: bigintAsString().references(
      () => integrationInstagramModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    adAccountId: text().notNull(),
    /** User-facing label — also the base string `buildCorrelationName` tags with `[cbx:{id}]`. */
    name: text().notNull(),
    createState: messagingAdCreateState().notNull().default("pending"),
    publishState: messagingAdPublishState().notNull().default("draft"),
    metaCampaignId: text(),
    metaAdSetId: text(),
    metaAdCreativeId: text(),
    metaAdId: text(),
    input: jsonb().$type<MessagingAdOperationInput>().notNull(),
    lastError: text(),
    /** Best-effort cleanup (delete/pause compensation) failure — observable, never silently swallowed. */
    cleanupError: text(),
    createdBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("MessagingAdOperation_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("MessagingAdOperation_integrationWhatsappId_idx").using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast(),
    ),
    index("MessagingAdOperation_integrationMessengerId_idx").using(
      "btree",
      table.integrationMessengerId.asc().nullsLast(),
    ),
    index("MessagingAdOperation_integrationInstagramId_idx").using(
      "btree",
      table.integrationInstagramId.asc().nullsLast(),
    ),
    check(
      "MessagingAdOperation_channel_integration_check",
      // Exactly one channel FK is set and the other two are NULL — a malformed
      // write can never associate an operation with more than one channel.
      sql`(${table.channel} = 'whatsapp' AND ${table.integrationWhatsappId} IS NOT NULL AND ${table.integrationMessengerId} IS NULL AND ${table.integrationInstagramId} IS NULL) OR (${table.channel} = 'messenger' AND ${table.integrationMessengerId} IS NOT NULL AND ${table.integrationWhatsappId} IS NULL AND ${table.integrationInstagramId} IS NULL) OR (${table.channel} = 'instagram' AND ${table.integrationInstagramId} IS NOT NULL AND ${table.integrationWhatsappId} IS NULL AND ${table.integrationMessengerId} IS NULL)`,
    ),
  ],
)
