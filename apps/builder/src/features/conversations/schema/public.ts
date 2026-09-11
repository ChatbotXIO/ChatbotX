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
  id: zodBigintAsString(),
})

export const assignConversationPublicRequest = z.object({
  // Must be `u_<userId>` or `t_<inboxTeamId>` — anything else falls through
  // both branches in `assignConversation` and silently unassigns instead of
  // erroring, so the shape is enforced here rather than left to `min(1)`.
  assignedId: z
    .string()
    .trim()
    .regex(/^[ut]_\S+$/, "assignedId must start with 'u_' or 't_'")
    .nullable(),
})
