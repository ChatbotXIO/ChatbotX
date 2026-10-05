import {
  threadControlActions,
  threadControlEvents,
  threadControlStates,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { findConversationResponse } from "./resource"

// Reuses the same shared `findConversationResponse`/`listConversationsItemResource`
// as the already-public `conversations.list` and the private `findConversation`
// query (`conversations.list` is a grandfathered `workspaceId`-leak exception
// in public-spec-operations.test.ts). `get` is added to that same allow-list
// for the identical reason: the shape is shared with the private API and
// nests contact/user/inbox-team resources several of which also carry
// `workspaceId` — scrubbing the whole tree is out of scope here, tracked as
// the same follow-up as the pre-existing leaks. See that test file's comment
// for the fix-per-operation plan.
export const getConversationPublicResponse = findConversationResponse

export const conversationIdPathParam = z.object({
  id: zodBigintAsString().describe(
    "Conversation id. Get it from `conversations.list`.",
  ),
})

export const assignConversationPublicRequest = z.object({
  // Must be `u_<userId>` or `t_<inboxTeamId>` — anything else falls through
  // both branches in `assignConversation` and silently unassigns instead of
  // erroring, so the shape is enforced here rather than left to `min(1)`.
  assignedId: z
    .string()
    .trim()
    .regex(/^[ut]_\S+$/, "assignedId must start with 'u_' or 't_'")
    .nullable()
    .describe(
      "New assignee: `u_<userId>` for a user or `t_<inboxTeamId>` for an inbox team, or null to unassign.",
    ),
})

export const threadControlSnapshotResource = z.object({
  contactInboxId: z.string(),
  threadControlState: threadControlStates.nullable(),
  threadOwnerRole: z.string().nullable(),
  threadOwnerAppId: z.string().nullable(),
  threadControlUpdatedAt: z.date().nullable(),
  threadOwnerExpiresAt: z.date().nullable(),
  threadControlLastEvent: threadControlEvents.nullable(),
})

export const threadControlPublicRequest = z
  .object({
    contactInboxId: zodBigintAsString().describe(
      "Contact inbox of the conversation's contact to steer. Get it from `conversations.get` (`contactInboxes[].id`).",
    ),
    action: z
      .enum([...threadControlActions.options, "sync"])
      .describe(
        "`take` the thread from the partner, `release` it back, `pass` it to the channel's escalation role, or `sync` to only refresh the stored owner from the channel (changes nothing at the channel).",
      ),
  })
  .and(conversationIdPathParam)

export const threadControlPublicResponse = z.object({
  status: z
    .enum(["applied", "notEscalation"])
    .describe(
      "`applied` (always, for `sync`), or `notEscalation` when the channel refused a `take` because only the escalation partner may take the thread.",
    ),
  snapshot: threadControlSnapshotResource
    .optional()
    .describe("The routing state after the action; absent when refused."),
})
