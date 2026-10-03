import { index, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

// This table is partitioned by HASH(workspaceId) in its migration. Every
// repository operation carries workspaceId so PostgreSQL can prune to one
// data partition. It intentionally has no FKs: a single-column cascade from
// ContactInbox would probe every partition. Contact deletion and workspace
// purge remove rows explicitly until ContactInbox gains a compatible key.
export const contactInboxPostModel = pgTable(
  "ContactInboxPost",
  {
    workspaceId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    // ChannelPost.id. No FK because deleting a ChannelPost would otherwise
    // probe every ContactInboxPost partition.
    postId: bigintAsString().notNull(),
    commentedAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.contactInboxId, table.postId],
      name: "ContactInboxPost_pkey",
    }),
    index("ContactInboxPost_workspaceId_postId_idx").on(
      table.workspaceId,
      table.postId,
    ),
  ],
)
