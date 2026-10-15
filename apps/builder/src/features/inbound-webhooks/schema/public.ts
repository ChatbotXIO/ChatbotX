import {
  inboundWebhookActionResultSchema,
  inboundWebhookFieldErrorCodes,
  inboundWebhookFieldErrorSchema,
  inboundWebhookMappedFieldKinds,
  inboundWebhookRequestStatuses,
  inboundWebhookStoredFieldMappingSchema,
  inboundWebhookStoredIdentifierSchema,
  inboundWebhookStoredInboxResolutionSchema,
} from "@chatbotx.io/database/partials"
import type {
  InboundWebhookListRow,
  InboundWebhookRequestListRow,
} from "@chatbotx.io/database/repositories"
import type {
  InboundWebhookModel,
  InboundWebhookRequestModel,
} from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { channelTypes } from "@chatbotx.io/utils/channel"
import {
  type ChannelUserIdKind,
  channelUserIdKinds,
  contactIdentityKinds,
  INBOUND_WEBHOOK_CHANNEL_SPECS,
  type InboxIdentifierKind,
  inboxIdentifierKinds,
  inboxLookupStrategies,
  PAYLOAD_RESOLVABLE_CHANNELS,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import z from "zod"
import { publicListResponse } from "@/lib/public-api/list"
import { inboundWebhookActionSchema } from "./action"

export const inboundWebhookIdSchema = zodBigintAsString().describe(
  "Inbound webhook id. Get it from `inboundWebhooks.list`.",
)

export const inboundWebhookSummaryResource = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  requestCount: z
    .number()
    .int()
    .describe(
      "Every request this webhook accepted (a duplicate is not counted), including ones whose log has since been purged.",
    ),
})

/** Never carries the token: it is only ever exposed as part of `endpointUrl`. */
export const inboundWebhookResource = inboundWebhookSummaryResource.extend({
  endpointUrl: z
    .string()
    .optional()
    .describe(
      "The URL external systems POST JSON to. It embeds the secret token — treat it like a password. Omitted for read-only API tokens: anyone holding the URL can run the webhook's actions, which a read-only token must not be able to do.",
    ),
  // Stored shapes: a response never re-validates (or rewrites) what was saved.
  inboxResolution: inboundWebhookStoredInboxResolutionSchema.nullable(),
  identifiers: z.array(inboundWebhookStoredIdentifierSchema),
  fieldMappings: z.array(inboundWebhookStoredFieldMappingSchema),
  actions: z.array(inboundWebhookActionSchema),
  sampleJson: z.unknown(),
})

export const listInboundWebhooksPublicResponse = publicListResponse(
  inboundWebhookSummaryResource,
)

export const toInboundWebhookSummary = (webhook: InboundWebhookListRow) => ({
  id: webhook.id,
  name: webhook.name,
  active: webhook.active,
  createdAt: webhook.createdAt,
  updatedAt: webhook.updatedAt,
  requestCount: webhook.requestCount,
})

export const toInboundWebhookResource = (
  webhook: InboundWebhookModel,
  endpointUrl?: string,
): z.infer<typeof inboundWebhookResource> => ({
  ...toInboundWebhookSummary(webhook),
  ...(endpointUrl ? { endpointUrl } : {}),
  inboxResolution: webhook.inboxResolution,
  identifiers: webhook.identifiers,
  fieldMappings: webhook.fieldMappings,
  actions: webhook.actions as z.infer<typeof inboundWebhookActionSchema>[],
  sampleJson: webhook.sampleJson,
})

export const regeneratedTokenResource = z.object({
  endpointUrl: z
    .string()
    .describe("The new URL; the previous one stops working."),
})

// ─── Requests ──────────────────────────────────────────────────────────────

export const inboundWebhookRequestSummaryResource = z.object({
  id: z.string(),
  status: inboundWebhookRequestStatuses,
  skipReason: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  inboxId: z.string().nullable(),
  contactId: z.string().nullable(),
  attempts: z.number().int(),
  receivedAt: z.date(),
  processedAt: z.date().nullable(),
})

export const inboundWebhookRequestDetailResource =
  inboundWebhookRequestSummaryResource.extend({
    fieldErrors: z.array(inboundWebhookFieldErrorSchema).nullable(),
    actionResults: z.array(inboundWebhookActionResultSchema).nullable(),
    payload: z
      .unknown()
      .optional()
      .describe("Only present when `includePayload` is `true`."),
  })

export const toInboundWebhookRequestSummary = (
  request: InboundWebhookRequestListRow,
): z.infer<typeof inboundWebhookRequestSummaryResource> => ({
  id: request.id,
  status: request.status,
  skipReason: request.skipReason,
  errorCode: request.errorCode,
  errorMessage: request.errorMessage,
  inboxId: request.inboxId,
  contactId: request.contactId,
  attempts: request.attempts,
  receivedAt: request.createdAt,
  processedAt: request.processedAt,
})

export const toInboundWebhookRequestDetail = (
  request: InboundWebhookRequestModel,
  includePayload: boolean,
): z.infer<typeof inboundWebhookRequestDetailResource> => ({
  ...toInboundWebhookRequestSummary(request),
  fieldErrors: request.fieldErrors,
  actionResults: request.actionResults,
  ...(includePayload ? { payload: request.payload } : {}),
})

export const listInboundWebhookRequestsPublicResponse = publicListResponse(
  inboundWebhookRequestSummaryResource,
)

// ─── Preview ───────────────────────────────────────────────────────────────

export const previewMappingResource = z.object({
  inboxIdentifier: z.string().nullable(),
  identifiers: z.array(
    z.object({
      kind: contactIdentityKinds,
      raw: z.string().nullable(),
      normalized: z.string().nullable(),
    }),
  ),
  identities: z.object({
    channelUserId: z.string().optional(),
    phoneE164: z.string().optional(),
    email: z.string().optional(),
    fullName: z.string().optional(),
  }),
  contactLookup: z
    .object({ kind: contactIdentityKinds, value: z.string() })
    .nullable()
    .describe(
      "The one identity the contact would be searched by: the first usable one in order channelUserId, phone, email, fullName. `null` when none is usable.",
    ),
  fields: z.array(
    z.object({
      target: z.string(),
      kind: inboundWebhookMappedFieldKinds,
      raw: z.string().nullable(),
      value: z.string().nullable(),
      error: inboundWebhookFieldErrorCodes.nullable(),
    }),
  ),
})

// ─── Channel registry ──────────────────────────────────────────────────────

// Exhaustive on purpose: a new kind must say what value its path has to yield.
const INBOX_IDENTIFIER_DESCRIPTIONS: Record<InboxIdentifierKind, string> = {
  pageId:
    "The numeric Facebook page id (`Inbox.sourceId` of a Messenger inbox, see `inboxes.list`).",
  igId: "The numeric Instagram account id (`sourceId` of an Instagram inbox).",
  phoneNumberId:
    "The WhatsApp Business phone number id from Meta (`sourceId` of a WhatsApp inbox) — exact, preferred.",
  displayPhoneNumber:
    "The WhatsApp number as people read it (e.g. +84 90 123 4567); only digits are compared, and two numbers sharing it make the request ambiguous.",
  botId:
    "The numeric Telegram bot id (`sourceId` of a Telegram inbox), not the @username.",
  oaId: "The Zalo Official Account id (`sourceId` of a Zalo inbox).",
  openId:
    "The connected TikTok account's open id, not the username or a customer's id.",
  threadsUserId:
    "The numeric Threads account id (`sourceId` of a Threads inbox).",
}

const CHANNEL_USER_ID_DESCRIPTIONS: Record<ChannelUserIdKind, string> = {
  psid: "The Messenger page-scoped user id of the person.",
  igsid: "The Instagram-scoped user id of the person.",
  telegramChatId: "The Telegram chat id of the person.",
  zaloUserId: "The Zalo user id of the person.",
  tiktokCustomerOpenId:
    "The TikTok open id of the customer (not the connected account).",
  threadsUsername: "The person's Threads username; matched lower-cased.",
  whatsappId:
    "The WhatsApp user id (`wa_id`): the phone number's digits, with or without a leading +.",
  apiSourceId: "The caller-defined contact id used with the API channel.",
}

export const inboundWebhookChannelResource = z.object({
  channel: channelTypes,
  payloadResolvable: z
    .boolean()
    .describe(
      "Whether the inbox can be chosen from a value in the payload. Otherwise only a fixed inbox works.",
    ),
  inboxIdentifiers: z.array(
    z.object({
      kind: inboxIdentifierKinds,
      strategy: inboxLookupStrategies,
      examplePath: z.string().describe("A typical JSON path for this value."),
      description: z.string().describe("What value the JSON path must yield."),
    }),
  ),
  channelUserId: z
    .object({
      kind: channelUserIdKinds,
      examplePath: z.string().describe("A typical JSON path for this value."),
      description: z.string().describe("What value the JSON path must yield."),
    })
    .nullable(),
  creationIdentities: z
    .array(contactIdentityKinds)
    .describe(
      "Identities a NEW contact can be created from on this channel. Any identity can find an existing contact; without one of these in the payload an unknown contact is skipped (`contactNotFound`).",
    ),
})

export const listInboundWebhookChannels = (): z.infer<
  typeof inboundWebhookChannelResource
>[] =>
  channelTypes.options.map((channel) => {
    const spec = INBOUND_WEBHOOK_CHANNEL_SPECS[channel]
    return {
      channel,
      payloadResolvable: PAYLOAD_RESOLVABLE_CHANNELS.includes(channel),
      inboxIdentifiers: spec.inboxIdentifiers.map((identifier) => ({
        ...identifier,
        description: INBOX_IDENTIFIER_DESCRIPTIONS[identifier.kind],
      })),
      channelUserId: spec.channelUserId
        ? {
            ...spec.channelUserId,
            description: CHANNEL_USER_ID_DESCRIPTIONS[spec.channelUserId.kind],
          }
        : null,
      creationIdentities: [...spec.creationIdentities],
    }
  })
