import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  InboundWebhookAction,
  InboundWebhookFieldMapping,
  InboundWebhookIdentifier,
  InboundWebhookInboxResolution,
} from "../partials/inbound-webhook"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const inboundWebhookModel = pgTable(
  "InboundWebhook",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    // Starts off: a webhook only receives once its config is complete.
    active: boolean().notNull().default(false),
    // The capability in the endpoint URL (`/api/hooks/<token>`); stored raw so
    // the owner can copy the link again. Never returned by list endpoints.
    token: text().notNull(),
    // NULL until the editor picks an inbox (or a channel + identifier path).
    inboxResolution: jsonb().$type<InboundWebhookInboxResolution>(),
    // The jsonb columns below have no DB default on purpose (a drizzle
    // `.default()` on jsonb is not a database default, see AGENTS.md): every
    // insert writes them explicitly.
    identifiers: jsonb().$type<InboundWebhookIdentifier[]>().notNull(),
    fieldMappings: jsonb().$type<InboundWebhookFieldMapping[]>().notNull(),
    actions: jsonb().$type<InboundWebhookAction[]>().notNull(),
    sampleJson: jsonb().$type<unknown>(),
    // Every request ever accepted (a duplicate is not one). Kept in step with
    // the request rows inside the same transaction, so retention purges never
    // lower it.
    requestCount: bigint({ mode: "number" }).notNull().default(0),
  },
  (table) => [
    index("InboundWebhook_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("InboundWebhook_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
  ],
)
