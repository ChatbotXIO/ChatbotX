import { index, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { webhookModel } from "./webhook"
import { workspaceModel } from "./workspace"

export const webhookExecutionModel = pgTable(
  "WebhookExecution",
  {
    ...sharedColumns,
    executedAt: timestamp(timestampConfig).defaultNow().notNull(),
    webhookId: bigintAsString()
      .notNull()
      .references(() => webhookModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("WebhookExecution_webhookId_contactId_key").on(
      table.webhookId,
      table.contactId,
    ),
    index("WebhookExecution_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("WebhookExecution_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
  ],
)
