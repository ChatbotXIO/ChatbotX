import {
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import {
  type SocialPostSnippetKind,
  socialPostSnippetKinds,
} from "../partials/social-post-snippet"
import { workspaceModel } from "./workspace"

export const socialPostSnippetKind = pgEnum(
  "socialPostSnippetKind",
  socialPostSnippetKinds.options as [
    SocialPostSnippetKind,
    ...SocialPostSnippetKind[],
  ],
)

/**
 * A reusable piece of post text a composer inserts or appends: a signature, a
 * hashtag set, or any other text. Plain text only (no variables). Not
 * `SavedReply` (an Inbox shortcut) and not copied by templates.
 */
export const socialPostSnippetModel = pgTable(
  "SocialPostSnippet",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: socialPostSnippetKind().notNull(),
    name: text().notNull(),
    content: text().notNull(),
    // Display order in the picker; the lowest comes first.
    position: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("SocialPostSnippet_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)
