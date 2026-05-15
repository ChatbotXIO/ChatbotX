import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  analyticsBotResponseTypes,
  analyticsBotResults,
  analyticsBotRouteTypes,
} from "../../partials/analytics-events"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsBotResponseTypeEnum = pgEnum(
  "analyticsBotResponseType",
  analyticsBotResponseTypes.options as [string, ...string[]],
)

export const analyticsBotRouteTypeEnum = pgEnum(
  "analyticsBotRouteType",
  analyticsBotRouteTypes.options as [string, ...string[]],
)

export const analyticsBotResultEnum = pgEnum(
  "analyticsBotResult",
  analyticsBotResults.options as [string, ...string[]],
)

export const analyticsBotMessageEventModel = pgTable(
  "AnalyticsBotMessageEvent",
  {
    eventId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    messageId: bigintAsString().notNull(),
    conversationId: bigintAsString().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    hasResponse: boolean().notNull().default(false),
    responseType: analyticsBotResponseTypeEnum(),
    routeType: analyticsBotRouteTypeEnum(),
    result: analyticsBotResultEnum(),
    aiProvider: text(),
    channel: text(),
    source: text(),
    metadata: jsonb(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.eventId] }),
    index("AnalyticsBotMessageEvent_workspaceId_occurredAt_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("AnalyticsBotMessageEvent_workspaceId_aiProvider_occurredAt_idx").on(
      table.workspaceId,
      table.aiProvider,
      table.occurredAt,
    ),
    index(
      "AnalyticsBotMessageEvent_workspaceId_hasResponse_result_occurredAt_idx",
    ).on(table.workspaceId, table.hasResponse, table.result, table.occurredAt),
  ],
)
