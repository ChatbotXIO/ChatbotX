import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { FacebookMarketingMessageRecipientStatus } from "../partials/facebook-marketing-messages"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { facebookMarketingMessageModel } from "./facebook-marketing-message"
import { workspaceModel } from "./workspace"

/**
 * One row = one Meta subscription token that receives a campaign's message at
 * most once (unique per campaign + token). Not partitioned: volume is tens of
 * thousands per campaign.
 */
export const facebookMarketingMessageRecipientModel = pgTable(
  "FacebookMarketingMessageRecipient",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    campaignRowId: bigintAsString()
      .notNull()
      .references(() => facebookMarketingMessageModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    subscriptionToken: text().notNull(),
    psid: text(),
    mid: text(),
    trackingId: text(),
    status: text().$type<FacebookMarketingMessageRecipientStatus>().notNull(),
    attempts: integer().default(0).notNull(),
    nextAttemptAt: timestamp(timestampConfig),
    nextEligibleAt: timestamp(timestampConfig),
    sentAt: timestamp(timestampConfig),
    deliveredAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    errorCode: integer(),
    errorMessage: text(),
    errorSource: text().$type<"send" | "webhook">(),
  },
  (table) => [
    uniqueIndex("FacebookMarketingMessageRecipient_campaign_token_key").on(
      table.campaignRowId,
      table.subscriptionToken,
    ),
    index("FacebookMarketingMessageRecipient_trackingId_idx").using(
      "btree",
      table.trackingId.asc().nullsLast(),
    ),
    index("FacebookMarketingMessageRecipient_due_idx")
      .on(table.campaignRowId, table.nextAttemptAt, table.id)
      .where(sql`${table.status} = 'pending'`),
  ],
)
