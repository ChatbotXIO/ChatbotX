import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type DecisionProfileContractJson,
  type DecisionProfileStatus,
  type DecisionProfileThresholdConfigJson,
  decisionProfileStatuses,
} from "../partials/decision"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { decisionConnectionModel } from "./decision-connection"
import { workspaceModel } from "./workspace"

export const decisionProfileStatus = pgEnum(
  "DecisionProfileStatus",
  decisionProfileStatuses.options as [
    DecisionProfileStatus,
    ...DecisionProfileStatus[],
  ],
)

/** Mutable executable Decision configuration, analogous to an AI Agent. */
export const decisionProfileModel = pgTable(
  "DecisionProfile",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    description: text(),
    status: decisionProfileStatus().notNull().default("enabled"),
    connectionId: bigintAsString()
      .notNull()
      .references(() => decisionConnectionModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    model: text().notNull(),
    contract: jsonb().$type<DecisionProfileContractJson>().notNull(),
    thresholdConfig: jsonb().$type<DecisionProfileThresholdConfigJson>(),
  },
  (table) => [
    index("DecisionProfile_workspaceId_idx").on(table.workspaceId),
    index("DecisionProfile_connectionId_idx").on(table.connectionId),
    uniqueIndex("DecisionProfile_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)
