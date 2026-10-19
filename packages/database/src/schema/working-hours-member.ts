import { foreignKey, index, pgTable, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { workingHoursModel } from "./working-hours"
import { workspaceModel } from "./workspace"

/**
 * One schedule per member per workspace. `workspaceId` is denormalised and
 * pinned to the parent schedule's workspace by the composite foreign key.
 */
export const workingHoursMemberModel = pgTable(
  "WorkingHoursMember",
  {
    ...sharedColumns,
    workingHoursId: bigintAsString().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    foreignKey({
      name: "WorkingHoursMember_workingHoursId_workspaceId_fkey",
      columns: [table.workingHoursId, table.workspaceId],
      foreignColumns: [workingHoursModel.id, workingHoursModel.workspaceId],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    unique("WorkingHoursMember_workspaceId_userId_key").on(
      table.workspaceId,
      table.userId,
    ),
    index("WorkingHoursMember_workingHoursId_idx").on(table.workingHoursId),
  ],
)
