import { createId } from "@chatbotx.io/utils"
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  smartDelayStatuses,
  smartDelayTypes,
} from "../partials/contact-on-smart-delay"
import { bigintAsString, timestampConfig } from "../partials/shared"
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
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text(),
    stepId: text(),
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
  ],
)
