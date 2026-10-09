import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { ChannelType } from "../partials/channel"
import {
  type GoogleAdsEventOptions,
  type GoogleAdsProcessingDetail,
  type GoogleAdsUploadMethod,
  googleAdsClickIdTypeValues,
  googleAdsEventSourceValues,
  googleAdsEventStatusValues,
  googleAdsFailureStageValues,
  googleAdsProcessingStatusValues,
  googleAdsUploadMethodValues,
} from "../partials/google-ads"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactInboxModel } from "./contact-inbox"
import { integrationGoogleAdsModel } from "./integration-google-ads"
import { workspaceModel } from "./workspace"

export const googleAdsEventSource = pgEnum(
  "googleAdsEventSource",
  googleAdsEventSourceValues,
)
export const googleAdsClickIdType = pgEnum(
  "googleAdsClickIdType",
  googleAdsClickIdTypeValues,
)
export const googleAdsEventStatus = pgEnum(
  "googleAdsEventStatus",
  googleAdsEventStatusValues,
)
export const googleAdsProcessingStatus = pgEnum(
  "googleAdsProcessingStatus",
  googleAdsProcessingStatusValues,
)
export const googleAdsFailureStage = pgEnum(
  "googleAdsFailureStage",
  googleAdsFailureStageValues,
)

export const googleAdsConversionEventModel = pgTable(
  "GoogleAdsConversionEvent",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // History must survive a disconnect and a contact deletion.
    integrationGoogleAdsId: bigintAsString().references(
      () => integrationGoogleAdsModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Account snapshot taken at insert; delivery skips when the live account differs.
    customerId: text().notNull(),
    loginCustomerId: text(),
    conversionCustomerId: text().notNull(),
    conversionActionId: text().notNull(),
    conversionActionName: text(),
    conversionActionCategory: text().notNull(),
    lookbackWindowDays: integer(),
    // Plain `ChannelType` text, like `ContactInbox.channel`: which channels may
    // record a conversion is decided at the producer (`googleAdsChannels` zod
    // list), so adding one needs no migration.
    channel: text().$type<ChannelType>().notNull(),
    source: googleAdsEventSource().notNull(),
    scopeId: text().notNull(),
    clickIdType: googleAdsClickIdType().notNull(),
    clickId: text().notNull(),
    googleClickReceivedAt: timestamp(timestampConfig).notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    value: numeric(),
    currency: text(),
    transactionId: text().notNull(),
    // Immutable snapshot (identity, time source, consent) written at insert;
    // null only on rows recorded before it existed. No `.default()`.
    options: jsonb().$type<GoogleAdsEventOptions>(),
    // Transport pinned at record time from the connection's method; delivery
    // routes by this, never by the live credential. No `.default()`: every
    // insert writes it explicitly.
    uploadMethod: text().$type<GoogleAdsUploadMethod>().notNull(),
    status: googleAdsEventStatus().notNull(),
    // Generation counter owned by us (distinct from BullMQ attemptsMade).
    attempt: integer().notNull(),
    claimToken: text(),
    claimedAt: timestamp(timestampConfig),
    requestId: text(),
    sentAt: timestamp(timestampConfig),
    error: text(),
    failureStage: googleAdsFailureStage(),
    processingStatus: googleAdsProcessingStatus(),
    processingCheckedAt: timestamp(timestampConfig),
    processingAttempts: integer().notNull(),
    nextProcessingCheckAt: timestamp(timestampConfig),
    processingDetail: jsonb().$type<GoogleAdsProcessingDetail>(),
  },
  (table) => [
    uniqueIndex("GoogleAdsConversionEvent_workspaceId_transactionId_key").on(
      table.workspaceId,
      table.transactionId,
    ),
    index("GoogleAdsConversionEvent_workspaceId_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.occurredAt.asc().nullsLast(),
    ),
    index("GoogleAdsConversionEvent_workspaceId_status_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("GoogleAdsConversionEvent_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("GoogleAdsConversionEvent_status_nextProcessingCheckAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.nextProcessingCheckAt.asc().nullsLast(),
    ),
    index("GoogleAdsConversionEvent_status_claimedAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.claimedAt.asc().nullsLast(),
    ),
    check(
      "GoogleAdsConversionEvent_sent_requires_request_check",
      sql`${table.status} NOT IN ('sent', 'processed') OR (${table.requestId} IS NOT NULL AND ${table.sentAt} IS NOT NULL)`,
    ),
    check(
      "GoogleAdsConversionEvent_sending_requires_claim_check",
      sql`${table.status} <> 'sending' OR (${table.claimToken} IS NOT NULL AND ${table.claimedAt} IS NOT NULL)`,
    ),
    check(
      "GoogleAdsConversionEvent_processing_status_check",
      sql`${table.processingStatus} IS NULL OR ${table.status} IN ('sent', 'processed', 'failed')`,
    ),
    check(
      "GoogleAdsConversionEvent_failure_stage_check",
      sql`${table.failureStage} IS NULL OR ${table.status} = 'failed'`,
    ),
    check(
      "GoogleAdsConversionEvent_value_currency_check",
      sql`(${table.value} IS NULL) = (${table.currency} IS NULL)`,
    ),
    check(
      "GoogleAdsConversionEvent_value_non_negative_check",
      sql`${table.value} IS NULL OR ${table.value} >= 0`,
    ),
    check(
      "GoogleAdsConversionEvent_clickId_length_check",
      sql`length(${table.clickId}) BETWEEN 10 AND 512`,
    ),
    check(
      "GoogleAdsConversionEvent_uploadMethod_check",
      sql`${table.uploadMethod} IN (${sql.join(
        googleAdsUploadMethodValues.map((method) => sql`${method}`),
        sql`, `,
      )})`,
    ),
    check(
      "GoogleAdsConversionEvent_attempt_check",
      sql`${table.attempt} >= 0 AND ${table.processingAttempts} >= 0`,
    ),
  ],
)
