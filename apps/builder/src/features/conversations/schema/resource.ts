import {
  threadControlEvents,
  threadControlStates,
} from "@chatbotx.io/database/partials"
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
}).omit({
  // Bookkeeping-only column for the human-reply window; not part of the API.
  awaitingHumanReplyClosedAt: true,
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

// Google Ads click summary derived server-side from `ContactInbox.referral`
// (see `resolveGoogleAdsClick`). Carries the click-id TYPE only — never the
// `gclid`/`gbraid` value, which is a conversion-attribution secret.
export const googleAdsClickResource = z.object({
  clickIdType: z.enum(["gclid", "gbraid"]),
  receivedAt: z.string().nullable(),
})

/**
 * Whether a manual (Inbox / API) message may be sent on this contact inbox now,
 * derived server-side from `lastIncomingMessageAt` by `resolveMessagingWindow`
 * (`@chatbotx.io/sdk`) — the same function the builder UI runs, so every client
 * agrees with the server's own send gate.
 */
export const messagingWindowResource = z.object({
  state: z
    .enum([
      "open",
      "humanAgent",
      "closed",
      "unlimited",
      "notApplicable",
      "unknown",
    ])
    .describe(
      "`open`: inside the standard window. `humanAgent`: Messenger/Instagram only, past 24h but within 7 days; sends carry the HUMAN_AGENT tag. `closed`: free-form messages are refused (`messagingWindowClosed`, 409); on WhatsApp send a template with `messages.sendWhatsappTemplate`. `unlimited`: the channel has no window. `notApplicable`: a comment conversation. `unknown`: the contact's last incoming message is not recorded; sending is allowed.",
    ),
  changesAt: z
    .date()
    .nullable()
    .describe(
      "Absolute moment `state` changes next (open to humanAgent or closed); null when it never changes.",
    ),
  closesAt: z
    .date()
    .nullable()
    .describe(
      "Absolute moment the window closes for good; null when it does not close.",
    ),
})
export type MessagingWindowResource = z.infer<typeof messagingWindowResource>

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
//
// The thread-control (conversation routing) columns ride along for the same
// reason: the list, header, composer and side panel read them from the store
// without a second request. Nullish tolerates a store persisted before they
// existed; `null` everywhere means routing was never observed.
export const conversationContactInboxResource = contactInboxResource.extend({
  adReferral: adReferralResource.nullable(),
  // Nullish for the same version-skew reason as `adReferral.sourceUrl`.
  googleAdsClick: googleAdsClickResource.nullish(),
  lastMessageAt: z.date().nullable(),
  messagingWindow: messagingWindowResource.describe(
    "Messaging window of this contact inbox, computed from `lastIncomingMessageAt`.",
  ),
  threadControlState: threadControlStates.nullish(),
  threadOwnerRole: z.string().nullish(),
  threadControlUpdatedAt: z.date().nullish(),
  threadOwnerExpiresAt: z.date().nullish(),
  threadOwnerAppId: z.string().nullish(),
  threadControlLastEvent: threadControlEvents.nullish(),
})
export type ConversationContactInboxResource = z.infer<
  typeof conversationContactInboxResource
>

/**
 * A workspace member who replied in a conversation. `image` is the same raw
 * value as `assignedUser.image`; the builder resolves it to a URL.
 */
export const conversationParticipantResource = z.object({
  userId: z.string().describe("Id of the member who replied."),
  name: z.string().nullable().describe("Display name of the member."),
  image: z.string().nullable().describe("Avatar of the member."),
  lastRepliedAt: z
    .date()
    .describe("When this member last replied in the conversation."),
})
export type ConversationParticipantResource = z.infer<
  typeof conversationParticipantResource
>

export const listConversationParticipantsResponse = z.object({
  data: z
    .array(conversationParticipantResource)
    .describe("Members who replied, most recent reply first."),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export type ListConversationParticipantsResponse = z.infer<
  typeof listConversationParticipantsResponse
>

export const listConversationsItemResource = conversationResource.extend({
  recentParticipants: z
    .array(conversationParticipantResource)
    .describe(
      "Up to the 3 members who replied most recently, newest first. Preview only: use `conversations.listParticipants` for everyone.",
    ),
  contactInboxes: z.array(conversationContactInboxResource),
  messages: z.array(messageResourceWithRelations),
  contact: contactResource.nullable(),
  assignedUser: userResource.nullable(),
  assignedInboxTeam: inboxTeamResource.nullable(),
})
export type ListConversationItemResource = z.infer<
  typeof listConversationsItemResource
>

export const conversationCompactContactInboxResource =
  conversationContactInboxResource
    .omit({
      adReferral: true,
      googleAdsClick: true,
      threadControlLastEvent: true,
      threadControlState: true,
      threadControlUpdatedAt: true,
      threadOwnerAppId: true,
      threadOwnerExpiresAt: true,
      threadOwnerRole: true,
    })
    .extend({
      inbox: z.object({
        id: z.string(),
        name: z.string(),
        channel: z.string(),
      }),
    })
export type ConversationCompactContactInboxResource = z.infer<
  typeof conversationCompactContactInboxResource
>

export const listConversationsCompactItemResource =
  listConversationsItemResource.extend({
    contactInboxes: z.array(conversationCompactContactInboxResource),
  })

export const listConversationsResponse = z.object({
  data: z.array(listConversationsItemResource),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
})
export type ListConversationsResponse = z.infer<
  typeof listConversationsResponse
>

export const listConversationsCompactResponse = z.object({
  data: z.array(listConversationsCompactItemResource),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
})
export type ListConversationsCompactResponse = z.infer<
  typeof listConversationsCompactResponse
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
