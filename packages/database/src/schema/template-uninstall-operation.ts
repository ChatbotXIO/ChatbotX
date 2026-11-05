import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
  type TemplateUninstallState,
  templateUninstallStates,
} from "../partials/template"
import { userModel } from "./auth-user"
import { templateModel } from "./template"
import { workspaceModel } from "./workspace"

export const templateUninstallOperationState = pgEnum(
  "templateUninstallOperationState",
  templateUninstallStates.options as [
    TemplateUninstallState,
    ...TemplateUninstallState[],
  ],
)

/**
 * One row per uninstall request, covering every installation of the group.
 * Append-only: a retry creates a new row, so an earlier operation's counts and
 * undelivered notice are never overwritten. `workspaceId` is the TARGET.
 */
export const templateUninstallOperationModel = pgTable(
  "TemplateUninstallOperation",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    templateId: bigintAsString().references(() => templateModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    publisherRef: text().notNull(),
    requestedByKind: text().$type<TemplateUninstallRequester>().notNull(),
    requestedBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // `pending` until the last member installation is final.
    state: templateUninstallOperationState().default("pending").notNull(),
    // Snapshot of the members' outcome counts, written once when final.
    counts: jsonb().$type<TemplateUninstallCounts>(),
    // Stable id of the one audit summary this operation sends.
    auditLogId: text().notNull(),
    noticeDeliveredAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("TemplateUninstallOperation_workspaceId_idx").on(table.workspaceId),
    index("TemplateUninstallOperation_templateId_idx").on(table.templateId),
    index("TemplateUninstallOperation_requestedBy_idx").on(table.requestedBy),
    // Notice redelivery sweep: final operations still undelivered.
    index("TemplateUninstallOperation_notice_idx").on(
      table.state,
      table.noticeDeliveredAt,
    ),
  ],
)
