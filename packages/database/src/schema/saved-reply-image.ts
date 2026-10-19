import { index, integer, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { mediaLibraryFileModel } from "./media-library-file"
import { savedReplyModel } from "./saved-reply"
import { workspaceModel } from "./workspace"

/**
 * Images attached to a saved reply, ordered by `position`. Points at the
 * media library row rather than copying the object, so deleting a file from
 * the library cascades it out of every saved reply instead of leaving a
 * dead link behind.
 */
export const savedReplyImageModel = pgTable(
  "SavedReplyImage",
  {
    ...sharedColumns,
    savedReplyId: bigintAsString()
      .notNull()
      .references(() => savedReplyModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    mediaLibraryFileId: bigintAsString()
      .notNull()
      .references(() => mediaLibraryFileModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer().notNull(),
  },
  (table) => [
    index("SavedReplyImage_savedReplyId_idx").using(
      "btree",
      table.savedReplyId.asc().nullsLast(),
    ),
    index("SavedReplyImage_mediaLibraryFileId_idx").using(
      "btree",
      table.mediaLibraryFileId.asc().nullsLast(),
    ),
    uniqueIndex("SavedReplyImage_savedReplyId_mediaLibraryFileId_key").on(
      table.savedReplyId,
      table.mediaLibraryFileId,
    ),
  ],
)
