import {
  conversationModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema/resource"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"
import { contactResource } from "@/features/contacts/schema/resource"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import { userResource } from "@/features/users/schema/resource"

export const conversationResource = createSelectSchema(conversationModel, {
  id: z.string(),
  contactId: z.string(),
  workspaceId: z.string(),
})
export type ConversationResource = z.infer<typeof conversationResource>

// Compact ad-attribution summary derived server-side from `ContactInbox.
// referral` (see `resolveAdReferral` in `@chatbotx.io/business/ads-conversion/
// channel-fields`) — never the raw referral jsonb, which carries an arbitrary
// webhook payload and must not leave the server.
export const adReferralResource = z.object({
  adTitle: z.string().nullable(),
  // Nullish (not just nullable): tolerates payloads produced before `sourceUrl`
  // was added to `resolveAdReferral` — a client store persisted across a deploy,
  // or a dev HMR skew where the schema rebuilt but the business helper did not.
  // The live mapper always sets it (string | null); this only guards version skew.
  sourceUrl: z.string().nullish(),
})

// Conversation-only extension of the shared `contactInboxResource` — kept out
// of the base resource so contact APIs (including public/workspace-token
// routes that nest `contactInboxResource`) are unaffected. Both conversation
// query paths (`listConversations` and `findConversation`) must map to this
// exact shape or oRPC output validation fails.
//
// `lastMessageAt` is conversation-only for the same reason: the auto-refresh
// profile hook (`useAutoRefreshContactProfile`) picks the most recently
// active on-demand-capable inbox among a contact's `contactInboxes`, mirroring
// the worker's `resolveMessengerUserContext`
// (apps/worker/src/integration/handlers/messenger-context.ts) — but that
// selection has no reason to leak into the public/workspace-token contact
// APIs that nest the shared `contactInboxResource`.
export const conversationContactInboxResource = contactInboxResource.extend({
  adReferral: adReferralResource.nullable(),
  lastMessageAt: z.date().nullable(),
})
export type ConversationContactInboxResource = z.infer<
  typeof conversationContactInboxResource
>

export const listConversationsItemResource = conversationResource.and(
  z.object({
    contactInboxes: z.array(conversationContactInboxResource),
    messages: z.array(messageResourceWithRelations),
    contact: contactResource.nullable(),
    assignedUser: userResource.nullable(),
    assignedInboxTeam: inboxTeamResource.nullable(),
  }),
)
export type ListConversationItemResource = z.infer<
  typeof listConversationsItemResource
>

export const listConversationsResponse = z.object({
  data: z.array(listConversationsItemResource),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
})
export type ListConversationsResponse = z.infer<
  typeof listConversationsResponse
>

export const findConversationRequest = z.object({
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
export type FindConversationRequest = z.infer<typeof findConversationRequest>

export const findConversationResponse = z.object({
  data: listConversationsItemResource,
})
export type FindConversationResponse = z.infer<typeof findConversationResponse>
