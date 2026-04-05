import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { broadcastScheduleTypes, broadcastStatuses } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const broadcastStatus = pgEnum(
  "broadcastStatus",
  broadcastStatuses.options as [string, ...string[]],
)
export const broadcastScheduleType = pgEnum(
  "broadcastScheduleType",
  broadcastScheduleTypes.options as [string, ...string[]],
)

export const broadcastModel = pgTable(
  "Broadcast",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    templateId: bigintAsString(),
    templateData: jsonb(),
    status: broadcastStatus().notNull(),
    schedulesType: broadcastScheduleType().notNull(),
    schedulesAt: timestamp(timestampConfig).notNull(),
    contactFilter: jsonb(),
    subaction: text().notNull(),
    channel: text().notNull(),
  },
  (table) => [
    index("Broadcast_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Broadcast_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
    index("Broadcast_channel_idx").using(
      "btree",
      table.channel.asc().nullsLast(),
    ),
    index("Broadcast_schedulesAt_idx").using(
      "btree",
      table.schedulesAt.asc().nullsLast(),
    ),
  ],
)
