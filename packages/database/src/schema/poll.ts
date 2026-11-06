import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

/**
 * A poll: a timed vote between candidates. Running iff
 * `startsAt <= now < endsAt` (`endsAt` exclusive). `afterVoteFlowId` runs for
 * a contact when their vote is new or changed.
 */
export const pollModel = pgTable(
  "Poll",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    imageUrl: text().notNull(),
    startsAt: timestamp(timestampConfig).notNull(),
    endsAt: timestamp(timestampConfig).notNull(),
    afterVoteFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("Poll_workspaceId_createdAt_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("Poll_afterVoteFlowId_idx").on(table.afterVoteFlowId),
  ],
)

export const pollCandidateModel = pgTable(
  "PollCandidate",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    pollId: bigintAsString()
      .notNull()
      .references(() => pollModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer().notNull(),
    name: text().notNull(),
    description: text(),
    imageUrl: text(),
  },
  (table) => [
    index("PollCandidate_pollId_position_idx").on(table.pollId, table.position),
    index("PollCandidate_workspaceId_idx").on(table.workspaceId),
  ],
)

/** One vote per `(pollId, contactId)`; a re-vote updates the row in place. */
export const pollVoteModel = pgTable(
  "PollVote",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    pollId: bigintAsString()
      .notNull()
      .references(() => pollModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    candidateId: bigintAsString()
      .notNull()
      .references(() => pollCandidateModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    uniqueIndex("PollVote_pollId_contactId_key").on(
      table.pollId,
      table.contactId,
    ),
    index("PollVote_workspaceId_idx").on(table.workspaceId),
    index("PollVote_candidateId_idx").on(table.candidateId),
    index("PollVote_contactId_idx").on(table.contactId),
    index("PollVote_contactInboxId_idx").on(table.contactInboxId),
  ],
)
