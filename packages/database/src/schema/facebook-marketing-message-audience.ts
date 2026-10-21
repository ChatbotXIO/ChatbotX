import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * One row = one Messenger Marketing Messages Custom Audience created through
 * ChatbotX. Inserted only after Meta returned the audience id, so
 * `customAudienceId` is never null.
 *
 * `pageId` is a RAW Meta Page id with no FK to `IntegrationMessenger` on
 * purpose (same as `FacebookMarketingMessage`): the audience lives on Meta and
 * must survive the workspace reconnecting the Page.
 *
 * Approximate count and delivery status are NOT stored — they are always read
 * live from Meta. `readyAt` is the one cached fact: once subscription tokens
 * exist for the audience the token check is never repeated.
 */
export const facebookMarketingMessageAudienceModel = pgTable(
  "FacebookMarketingMessageAudience",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customAudienceId: text().notNull(),
    // `act_<id>` form, exactly as sent to Graph.
    adAccountId: text().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    description: text(),
    // Sum of Meta's `num_received` across every upload. No DB default on
    // purpose — every insert writes 0 explicitly.
    rowsUploaded: integer().notNull(),
    readyAt: timestamp(timestampConfig),
    // App-Scoped User ID of the grant used at create time.
    facebookUserId: text(),
  },
  (table) => [
    index("FacebookMarketingMessageAudience_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("FacebookMarketingMessageAudience_customAudienceId_key").using(
      "btree",
      table.customAudienceId.asc().nullsLast(),
    ),
  ],
)
