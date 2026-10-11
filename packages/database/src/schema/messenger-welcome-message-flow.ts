import { sql } from "drizzle-orm"
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { z } from "zod"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationMessengerModel } from "./integration-messenger"
import { workspaceModel } from "./workspace"

export const messengerWelcomeMessageFlowStatuses = z.enum([
  "current",
  "superseded",
])
export type MessengerWelcomeMessageFlowStatus = z.infer<
  typeof messengerWelcomeMessageFlowStatuses
>

/**
 * A Meta "welcome message flow" (Click-to-Messenger ads) created from a flow's
 * published start node on one Messenger page.
 *
 * `flowId` has NO foreign key on purpose: `Flow` is hard-deleted, and the
 * delete job still needs these rows afterwards to call Meta's DELETE — the job
 * removes them itself. `superseded` rows are older Meta flows that could not
 * be updated (e.g. attached to an ad) and are only cleaned up when the flow is
 * deleted.
 */
export const messengerWelcomeMessageFlowModel = pgTable(
  "MessengerWelcomeMessageFlow",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString().notNull(),
    integrationMessengerId: bigintAsString()
      .notNull()
      .references(() => integrationMessengerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    pageId: text().notNull(),
    metaFlowId: text().notNull(),
    flowVersionId: bigintAsString(),
    status: text()
      .$type<MessengerWelcomeMessageFlowStatus>()
      .notNull()
      .default("current"),
  },
  (table) => [
    index("MessengerWelcomeMessageFlow_workspaceId_flowId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.flowId.asc().nullsLast(),
    ),
    index("MessengerWelcomeMessageFlow_integrationMessengerId_idx").using(
      "btree",
      table.integrationMessengerId.asc().nullsLast(),
    ),
    uniqueIndex("MessengerWelcomeMessageFlow_current_key")
      .using(
        "btree",
        table.flowId.asc().nullsLast(),
        table.integrationMessengerId.asc().nullsLast(),
      )
      .where(sql`${table.status} = 'current'`),
  ],
)
