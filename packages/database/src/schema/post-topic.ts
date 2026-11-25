import {
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { channelPostModel } from "./channel-post"
import { workspaceModel } from "./workspace"

// A label a workspace puts on posts to group them. Not `Tag` (contacts) and
// not `Folder`: topics are free-form, flat, and only ever attach to posts.
export const postTopicModel = pgTable(
  "PostTopic",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    color: text(),
  },
  (table) => [
    uniqueIndex("PostTopic_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)

export const channelPostToPostTopicModel = pgTable(
  "ChannelPostToPostTopic",
  {
    channelPostId: bigintAsString()
      .notNull()
      .references(() => channelPostModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    postTopicId: bigintAsString()
      .notNull()
      .references(() => postTopicModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.channelPostId, table.postTopicId] }),
    index("ChannelPostToPostTopic_postTopicId_idx").on(table.postTopicId),
  ],
)
