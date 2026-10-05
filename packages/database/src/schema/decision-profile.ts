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
  decisionProfileStatuses,
} from "../partials/decision"
import { bigintAsString, sharedColumns } from "../partials/shared"
import {
  decisionConnectionModel,
  decisionProviderKind,
} from "./decision-connection"
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
    providerKind: decisionProviderKind().notNull(),
    model: text().notNull(),
    contract: jsonb().$type<DecisionProfileContractJson>().notNull(),
  },
  (table) => [
    index("DecisionProfile_workspaceId_idx").on(table.workspaceId),
    uniqueIndex("DecisionProfile_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)
