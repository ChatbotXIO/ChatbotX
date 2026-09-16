import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

/**
 * Enforces that a Threads account backs exactly one integration.
 *
 * Exported so callers can recognise this specific collision: the table has
 * more than one unique index, and this one means "already connected" rather
 * than a bug (mirrors `INSTAGRAM_IG_ID_UNIQUE_CONSTRAINT`). Note it is global,
 * not workspace-scoped, so it is the only guard against the same account being
 * connected from two different workspaces.
 */
export const THREADS_USER_ID_UNIQUE_CONSTRAINT =
  "IntegrationThreads_threadsUserId_key"

export const integrationThreadsModel = pgTable(
  "IntegrationThreads",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    threadsUserId: text().notNull(),
    username: text().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tokenRefreshError: text(),
  },
  (table) => [
    index("IntegrationThreads_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationThreads_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex(THREADS_USER_ID_UNIQUE_CONSTRAINT).using(
      "btree",
      table.threadsUserId.asc().nullsLast(),
    ),
  ],
)
