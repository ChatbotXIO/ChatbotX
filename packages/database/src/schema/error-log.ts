import { index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const errorLogModel = pgTable(
  "ErrorLog",
  {
    ...sharedColumns,
    /**
     * The failing third party, one value from `errorLogProviders`. Not an
     * operation name and not an error message.
     */
    action: text().notNull(),
    detail: text().notNull(),
    httpCode: text(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    // Serves the workspace error-log list: filter by workspace, newest first.
    index("ErrorLog_workspaceId_createdAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    // Serves the `purgeErrorLogs` retention cron's age scan.
    index("ErrorLog_createdAt_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    // Serves the `onDelete: "set null"` FK scan Postgres runs on every
    // `Contact` delete. Every comparable contactId FK in the schema is indexed.
    index("ErrorLog_contactId_idx").on(table.contactId),
  ],
)
