import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { commentAutomationModel } from "./comment-automation"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const commentAutomationReplyModel = pgTable(
  "CommentAutomationReply",
  {
    ...sharedColumns,
    automationId: bigintAsString()
      .notNull()
      .references(() => commentAutomationModel.id, { onDelete: "cascade" }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, { onDelete: "cascade" }),
    postId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("CommentAutomationReply_dedup_idx").on(
      t.automationId,
      t.contactId,
      t.postId,
    ),
    index("CommentAutomationReply_contactId_idx").on(t.contactId),
  ],
)
