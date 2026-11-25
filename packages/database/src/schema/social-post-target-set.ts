import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { publishDestinationModel } from "./publish-destination"
import { workspaceModel } from "./workspace"

/**
 * A named selection of destinations a composer applies in one click. Only a
 * list of ids: applying it re-checks each destination (workspace, still
 * active, account connected). Not copied by templates (it points at external
 * accounts).
 */
export const socialPostTargetSetModel = pgTable(
  "SocialPostTargetSet",
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
    uniqueIndex("SocialPostTargetSet_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)

/** One destination of a set. A destination that is deleted drops out of its sets. */
export const socialPostTargetSetDestinationModel = pgTable(
  "SocialPostTargetSetDestination",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    targetSetId: bigintAsString()
      .notNull()
      .references(() => socialPostTargetSetModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    publishDestinationId: bigintAsString()
      .notNull()
      .references(() => publishDestinationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer().notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.targetSetId, table.publishDestinationId],
    }),
    index("SocialPostTargetSetDestination_workspaceId_idx").on(
      table.workspaceId,
    ),
    index("SocialPostTargetSetDestination_destinationId_idx").on(
      table.publishDestinationId,
    ),
  ],
)
