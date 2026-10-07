import { broadcastEventType } from "@chatbotx.io/analytics/schemas"
import {
  broadcastSendLimitSchema,
  broadcastStatuses,
  broadcastSubactions,
  channelTypes,
  isAudienceRangeOrdered,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { strictContactFilter } from "@/features/contacts/schema/public/crud"
import { publicListRequest } from "@/lib/public-api/list"
import {
  broadcastTargetSchema,
  createBroadcastFields,
  withBroadcastRules,
} from "./action"

// `listBroadcastContactsRequest`/`Response` in `@chatbotx.io/analytics/schemas`
// carry `workspaceId` (injected from the token's resolved workspace, never
// accepted from client input) and `conversationId` (an internal builder-
// navigation detail, not a public API concern) — narrow variants declared
// here instead of reusing those directly, mirroring `analytics/schema/public.ts`.
export const publicListBroadcastContactsRequest = z.object({
  id: zodBigintAsString().describe(
    "Broadcast id. Get it from `broadcasts.list`.",
  ),
  eventType: broadcastEventType.describe(
    "Event to filter recipients by: `message:sent`, `message:delivered`, `message:seen`, `message:failed` or `flow:clicked`. `message:received` and `flow:ref` are accepted but not tracked per recipient, so they return the same list as `message:delivered`.",
  ),
  page: publicListRequest.shape.page,
  perPage: publicListRequest.shape.perPage,
})

export const publicBroadcastContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: channelTypes,
  errorContent: z.string().nullable(),
  occurredAt: z.string(),
  conversationId: z
    .string()
    .describe(
      "Conversation of this contact inbox. Use it with `messages.create` to reply.",
    ),
})

export const publicListBroadcastContactsResponse = z.object({
  data: z.array(publicBroadcastContactResource),
  total: z
    .number()
    .int()
    .describe("Number of recipients that reached this event, across pages."),
  pageCount: z.number().int(),
})

export const listBroadcastsPublicRequest = publicListRequest.extend({
  status: broadcastStatuses
    .optional()
    .describe("Restrict to broadcasts in this status."),
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the broadcast name."),
  channel: channelTypes
    .optional()
    .describe("Restrict to broadcasts sent on this channel."),
  scheduledFrom: z.coerce
    .date()
    .optional()
    .describe("Only broadcasts scheduled at or after this time (ISO 8601)."),
  scheduledTo: z.coerce
    .date()
    .optional()
    .describe("Only broadcasts scheduled at or before this time (ISO 8601)."),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `createdAt`, `schedulesAt`, `name`. Defaults to newest first.",
    ),
})

/**
 * Audience selectors shared by the pre-send count and preview. They mirror the
 * audience part of `broadcasts.create`, so a caller can try a filter first and
 * then create the broadcast with the same values.
 */
const broadcastAudiencePublicShape = {
  inboxIds: z
    .array(zodBigintAsString())
    .optional()
    .describe(
      "Inbox ids (numeric strings) the broadcast would send from. Get them from `inboxes.list`. Pick the audience with `inboxIds`, or with `channels` (`omnichannel` means every channel), or with an integration id; when you give none of them the audience is empty.",
    ),
  channels: z
    .array(channelTypes)
    .optional()
    .describe(
      "Channels to send on; `omnichannel` means every channel. Needed when `inboxIds` is omitted.",
    ),
  integrationWhatsappId: zodBigintAsString()
    .optional()
    .describe(
      "Only inboxes of this WhatsApp integration id. Get it from `whatsappChannels.list`.",
    ),
  integrationMessengerId: zodBigintAsString()
    .optional()
    .describe(
      "Only inboxes of this Messenger integration id. Get it from `messengerChannels.list`.",
    ),
  subaction: broadcastSubactions
    .optional()
    .describe(
      "Audience sub-action filter, the same value `broadcasts.create` takes.",
    ),
  contactFilter: strictContactFilter,
  audienceRangeStart:
    broadcastSendLimitSchema.shape.audienceRangeStart.describe(
      "1-based inclusive start of the ordered audience window (ascending contact inbox id). Omit to start from the first contact.",
    ),
  audienceRangeEnd: broadcastSendLimitSchema.shape.audienceRangeEnd.describe(
    "1-based inclusive end of the ordered audience window. Omit to include through the last contact.",
  ),
}

export const previewBroadcastAudiencePublicRequest = z
  .object({
    ...broadcastAudiencePublicShape,
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Page number, starting at 1. Defaults to 1."),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Rows per page, 1-50. Defaults to 20."),
  })
  .refine(isAudienceRangeOrdered, {
    path: ["audienceRangeEnd"],
    message: "`audienceRangeEnd` must not be before `audienceRangeStart`",
  })

export const previewBroadcastAudiencePublicResponse = z.object({
  total: z
    .number()
    .describe(
      "Size of the whole audience (the audience window applied), not just this page. A contact on several channels counts once per channel.",
    ),
  data: z.array(
    z.object({
      contactId: z.string().describe("Contact id."),
      contactInboxId: z
        .string()
        .describe("Contact inbox id (one per contact per channel)."),
      firstName: z.string().nullable().describe("Contact first name."),
      lastName: z.string().nullable().describe("Contact last name."),
      fullName: z.string().nullable().describe("Contact full name."),
      avatar: z
        .string()
        .nullable()
        .describe("Absolute avatar URL, or null when the contact has none."),
      occurredAt: z
        .string()
        .nullable()
        .describe("ISO 8601 time the contact was created."),
      channel: channelTypes.describe("Channel of this contact inbox."),
      conversationId: z
        .string()
        .nullable()
        .describe("Direct-message conversation id, or null when none exists."),
    }),
  ),
})

const templateParamsField = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    'Template values by key, e.g. `{"body.1": "Ann", "header": "https://.../a.jpg"}`. The keys are the `parameters` of `whatsappTemplates.get` / `messengerTemplates.get`. Use this or `templateData`, not both; a missing, unknown or invalid key is a 422 that lists the keys.',
  )

const hasParamsAndData = (entry: {
  templateParams?: Record<string, string>
  templateData?: unknown
}) => Boolean(entry.templateParams && entry.templateData)

/**
 * `createBroadcastRequest` plus flat `templateParams` (top level and per
 * target), so an API caller can fill a template by key instead of building
 * Meta's nested `templateData`. Same rules as the builder's request.
 */
export const createBroadcastPublicRequest = withBroadcastRules(
  createBroadcastFields.extend({
    templateParams: templateParamsField,
    targets: z
      .array(
        broadcastTargetSchema.extend({ templateParams: templateParamsField }),
      )
      .optional()
      .describe(
        "Per-page targets for a multi-page broadcast, each with its own template/flow.",
      ),
  }),
).refine(
  (data) =>
    !(hasParamsAndData(data) || (data.targets ?? []).some(hasParamsAndData)),
  {
    message: "Send templateParams or templateData, not both",
    path: ["templateParams"],
  },
)
export type CreateBroadcastPublicRequest = z.infer<
  typeof createBroadcastPublicRequest
>
