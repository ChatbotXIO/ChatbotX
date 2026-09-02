import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  smartDelayStatuses,
  smartDelayTypes,
} from "../partials/contact-on-smart-delay"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { appointmentModel } from "./appointment"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const contactOnSmartDelayType = pgEnum(
  "ContactOnSmartDelayType",
  smartDelayTypes.options as [string, ...string[]],
)

export const contactOnSmartDelayStatus = pgEnum(
  "ContactOnSmartDelayStatus",
  smartDelayStatuses.options as [string, ...string[]],
)

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
    flowId: bigintAsString().notNull(),
    flowVersionId: bigintAsString(),
    contactInboxId: bigintAsString().notNull(),
    appointmentId: bigintAsString().references(() => appointmentModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text(),
    stepId: text(),
    metadata: jsonb().$type<Record<string, unknown> | null>(),
    type: contactOnSmartDelayType().notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    triggerAt: timestamp(timestampConfig).notNull(),
    status: contactOnSmartDelayStatus()
      .default(smartDelayStatuses.enum.pending)
      .notNull(),
  },
  (table) => [
    index(
      "ContactOnSmartDelay_workspaceId_flowId_contactInboxId_stepId_idx",
    ).using(
      "btree",
      table.workspaceId,
      table.flowId,
      table.contactInboxId,
      table.stepId,
    ),
    index("ContactOnSmartDelay_status_triggerAt_idx").using(
      "btree",
      table.status,
      table.triggerAt,
    ),
    index("ContactOnSmartDelay_conversationId_idx").using(
      "btree",
      table.conversationId,
    ),
    index("ContactOnSmartDelay_appointmentId_idx").using(
      "btree",
      table.appointmentId,
    ),
    uniqueIndex("ContactOnSmartDelay_followUp_active_key")
      .on(table.workspaceId, table.contactInboxId, table.flowId, table.stepId)
      .where(
        // Active follow-up rows are any rows that have not reached a terminal
        // status.
        sql`${table.status} NOT IN ('completed', 'failed', 'canceled') AND ${table.type} = 'followUp'`,
      ),
  ],
)
