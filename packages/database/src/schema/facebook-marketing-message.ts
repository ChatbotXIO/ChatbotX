import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { FacebookMarketingMessageBudgetType } from "../partials/facebook-marketing-messages"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * One row = one Meta message campaign = one authored message.
 *
 * `pageId` is a RAW Meta Page id with no FK to `IntegrationMessenger` on
 * purpose: the campaign lives on Meta's side and must survive the workspace
 * disconnecting and reconnecting the Page.
 *
 * `campaignId` is NOT NULL because the campaign is created on Meta BEFORE the
 * row is inserted — a row without a live campaign can never exist, so the edit
 * path never has to handle one.
 *
 * `currency` and `currencyOffset` are snapshots so the minor-unit conversion
 * behind any historical row stays auditable (Meta's offset is 1 for eleven
 * currencies, 100 otherwise).
 */
export const facebookMarketingMessageModel = pgTable(
  "FacebookMarketingMessage",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    pageId: text().notNull(),
    // `act_<id>` form, exactly as sent to Graph.
    adAccountId: text().notNull(),
    currency: text().notNull(),
    currencyOffset: integer().notNull(),
    budgetType: text().$type<FacebookMarketingMessageBudgetType>().notNull(),
    // Minor units, exactly what was sent to Meta. `integer` caps at ~2.1e9,
    // which is far above any realistic campaign budget in any currency.
    budgetMinorUnits: integer().notNull(),
    content: jsonb().notNull(),
    campaignId: text().notNull(),
    // App-Scoped User ID of the grant used at create time, so a workspace can
    // tell a campaign was created under a different Facebook account.
    facebookUserId: text(),
  },
  (table) => [
    index("FacebookMarketingMessage_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("FacebookMarketingMessage_campaignId_key").using(
      "btree",
      table.campaignId.asc().nullsLast(),
    ),
  ],
)
