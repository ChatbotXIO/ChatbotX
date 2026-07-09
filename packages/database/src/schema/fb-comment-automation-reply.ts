import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { fbCommentAutomationModel } from "./fb-comment-automation"
import { workspaceModel } from "./workspace"

export const fbCommentAutomationReplyModel = pgTable(
  "FBCommentAutomationReply",
  {
    ...sharedColumns,
    automationId: bigintAsString()
      .notNull()
      .references(() => fbCommentAutomationModel.id, { onDelete: "cascade" }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, { onDelete: "cascade" }),
    postId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("FBCommentAutomationReply_dedup_idx").on(
      t.automationId,
      t.contactId,
      t.postId,
    ),
  ],
)
