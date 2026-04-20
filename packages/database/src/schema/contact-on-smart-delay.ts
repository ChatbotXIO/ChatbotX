import { createId } from "@chatbotx.io/utils"
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const contactOnSmartDelayModel = pgTable(
  "ContactOnSmartDelay",
  {
    id: bigintAsString()
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString(),
    contactInboxId: bigintAsString(),
    nodeId: text().notNull(),
    retryCount: integer().default(0).notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    triggerAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    index(
      "ContactOnSmartDelay_workspaceId_flowId_nodeId_contactInboxId_idx",
    ).using(
      "btree",
      table.workspaceId,
      table.flowId,
      table.nodeId,
      table.contactInboxId,
    ),
  ],
)
