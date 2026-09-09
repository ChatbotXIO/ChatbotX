import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { listConversationsItemResource } from "./resource"

// Reuses the same shared `listConversationsItemResource` as the already-public
// `conversations.list` (`conversations.list` is a grandfathered
// `workspaceId`-leak exception in public-spec-operations.test.ts). `get` is
// added to that same allow-list for the identical reason: the shape is
// shared with the private API and nests contact/user/inbox-team resources
// several of which also carry `workspaceId` — scrubbing the whole tree is
// out of scope here, tracked as the same follow-up as the pre-existing
// leaks. See that test file's comment for the fix-per-operation plan.
export const getConversationPublicResponse = z.object({
  data: listConversationsItemResource,
})

export const conversationIdPathParam = z.object({
  id: zodBigintAsString(),
})

export const assignConversationPublicRequest = z.object({
  assignedId: z.string().trim().min(1).nullable(),
})
