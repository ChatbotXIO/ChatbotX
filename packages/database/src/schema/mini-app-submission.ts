import { index, jsonb, pgEnum, pgTable } from "drizzle-orm/pg-core"
import {
  type MiniAppSubmissionSource,
  miniAppSubmissionSources,
} from "../partials/mini-app"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { miniAppModel } from "./mini-app"
import { workspaceModel } from "./workspace"

export const miniAppSubmissionSource = pgEnum(
  "miniAppSubmissionSource",
  miniAppSubmissionSources.options as [
    MiniAppSubmissionSource,
    ...MiniAppSubmissionSource[],
  ],
)

export const miniAppSubmissionModel = pgTable(
  "MiniAppSubmission",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    miniAppId: bigintAsString()
      .notNull()
      .references(() => miniAppModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Set when the link carried a signed contact token.
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    source: miniAppSubmissionSource().notNull(),
    answers: jsonb().$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("MiniAppSubmission_miniAppId_createdAt_idx").using(
      "btree",
      table.miniAppId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("MiniAppSubmission_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
  ],
)
