import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  FacebookMarketingMessageBudgetType,
  FacebookMarketingMessageStatus,
  FacebookMarketingMessageStatusReason,
  FacebookMarketingMessageTargetType,
} from "../partials/facebook-marketing-messages"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { facebookMarketingMessageAudienceModel } from "./facebook-marketing-message-audience"
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
 * `audienceId` is set only when `targetType` is `customAudience`. The FK is
 * `restrict` on purpose: an audience a campaign targets cannot be deleted
 * (the delete action checks first and shows a friendly error; the FK is the
 * backstop).
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
    targetType: text()
      .$type<FacebookMarketingMessageTargetType>()
      .default("optIn")
      .notNull(),
    audienceId: bigintAsString().references(
      () => facebookMarketingMessageAudienceModel.id,
      { onDelete: "restrict", onUpdate: "cascade" },
    ),
    campaignId: text().notNull(),
    // App-Scoped User ID of the grant used at create time, so a workspace can
    // tell a campaign was created under a different Facebook account.
    facebookUserId: text(),
    // Delivery state. Rows that predate delivery were backfilled `notSent`.
    status: text()
      .$type<FacebookMarketingMessageStatus>()
      .default("scheduled")
      .notNull(),
    statusReason: text().$type<FacebookMarketingMessageStatusReason>(),
    statusErrorCode: integer(),
    statusErrorMessage: text(),
    startsAt: timestamp(timestampConfig),
    startedAt: timestamp(timestampConfig),
    firstSentAt: timestamp(timestampConfig),
    completedAt: timestamp(timestampConfig),
    // Daily campaigns: when `waitingNextDay` resumes (next local midnight, or
    // a short backoff after a failed delivery estimate). Also reused as the
    // "not before" time for a `scheduled` campaign whose token snapshot hit a
    // retryable Graph error (`listDueToStart` skips it until then); prepare
    // clears it on success.
    nextDayAt: timestamp(timestampConfig),
    metaEndsAt: timestamp(timestampConfig),
    // Ad account timezone; the day boundary is midnight in it.
    timezoneName: text(),
    adSetId: text(),
    tokenCount: integer(),
    dayTarget: integer(),
    daySent: integer().default(0).notNull(),
    resumeCount: integer().default(0).notNull(),
  },
  (table) => [
    index("FacebookMarketingMessage_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("FacebookMarketingMessage_audienceId_idx").using(
      "btree",
      table.audienceId.asc().nullsLast(),
    ),
    index("FacebookMarketingMessage_status_startsAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.startsAt.asc().nullsLast(),
    ),
    uniqueIndex("FacebookMarketingMessage_campaignId_key").using(
      "btree",
      table.campaignId.asc().nullsLast(),
    ),
  ],
)
