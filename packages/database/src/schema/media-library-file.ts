import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { mediaLibraryFolderModel } from "./media-library-folder"
import { workspaceModel } from "./workspace"

export const mediaLibraryFileModel = pgTable(
  "MediaLibraryFile",
  {
    ...sharedColumns,
    name: text().notNull(),
    path: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    isFavourite: boolean().notNull().default(false),
    lastAccessedAt: timestamp(timestampConfig),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: bigintAsString().references(() => mediaLibraryFolderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("MediaLibraryFile_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("MediaLibraryFile_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
  ],
)
