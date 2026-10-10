import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type MiniAppUploadStatus,
  miniAppUploadStatuses,
} from "../partials/mini-app"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { miniAppModel } from "./mini-app"
import { miniAppSubmissionModel } from "./mini-app-submission"
import { workspaceModel } from "./workspace"

export const miniAppUploadStatus = pgEnum(
  "miniAppUploadStatus",
  miniAppUploadStatuses.options as [
    MiniAppUploadStatus,
    ...MiniAppUploadStatus[],
  ],
)

/** A file a visitor uploaded through a Mini App's public link. */
export const miniAppUploadModel = pgTable(
  "MiniAppUpload",
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
    // Set when the link carried a signed contact token; null = anonymous.
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    submissionId: bigintAsString().references(() => miniAppSubmissionModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    inputName: text().notNull(),
    // Random, unguessable id the visitor submits as proof of the upload.
    uploadToken: text().notNull(),
    path: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    status: miniAppUploadStatus().notNull(),
  },
  (table) => [
    uniqueIndex("MiniAppUpload_uploadToken_key").on(table.uploadToken),
    uniqueIndex("MiniAppUpload_path_key").on(table.path),
    index("MiniAppUpload_miniAppId_inputName_status_idx").using(
      "btree",
      table.miniAppId.asc().nullsLast(),
      table.inputName.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("MiniAppUpload_submissionId_idx").using(
      "btree",
      table.submissionId.asc().nullsLast(),
    ),
  ],
)
