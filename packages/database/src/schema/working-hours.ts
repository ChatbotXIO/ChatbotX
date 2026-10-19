import { index, pgTable, text, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const workingHoursModel = pgTable(
  "WorkingHours",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
  },
  (table) => [
    index("WorkingHours_workspaceId_idx").on(table.workspaceId),
    unique("WorkingHours_id_workspaceId_key").on(table.id, table.workspaceId),
  ],
)
