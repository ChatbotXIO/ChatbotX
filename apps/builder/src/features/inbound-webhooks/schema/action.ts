import {
  INBOUND_WEBHOOK_LIMITS,
  type InboundWebhookActionType,
  inboundWebhookFieldMappingsSchema,
  inboundWebhookIdentifiersSchema,
  inboundWebhookInboxResolutionSchema,
} from "@chatbotx.io/database/partials"
import { isJsonbStorable } from "@chatbotx.io/utils/json-path"
import z from "zod"
import { allActions } from "@/features/triggers/components/actions/schema"

/**
 * The trigger editor's schema for each action an inbound webhook may run, so one
 * action means the same thing in both places. Keyed by the allowlist
 * (`inboundWebhookActionTypes`): adding a type there fails to compile until its
 * schema is added here.
 */
const ACTION_SCHEMAS = {
  startAnotherFlow: allActions.startFlow,
  addTag: allActions.addTags,
  removeTag: allActions.removeTags,
  setCustomField: allActions.setCustomField,
  clearCustomField: allActions.clearCustomField,
  transferConversationToHuman: allActions.transferConversationToHuman,
} satisfies Record<InboundWebhookActionType, z.ZodType>

export const inboundWebhookActionSchema = z.union(Object.values(ACTION_SCHEMAS))

const utf8Bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength

// The structural check runs first and stops there: `JSON.stringify` (the size
// check) overflows the stack on deeply nested input and would throw instead of
// failing validation.
export const inboundWebhookSampleJsonSchema = z
  .unknown()
  .refine((value) => isJsonbStorable(value), {
    message:
      "The sample JSON contains unsupported characters or is nested too deeply",
    abort: true,
  })
  .refine(
    (value) => utf8Bytes(value) <= INBOUND_WEBHOOK_LIMITS.maxSampleJsonBytes,
    {
      message: "The sample JSON is too large",
    },
  )

/** A preview may carry a real delivery, which can be as large as one is accepted. */
export const inboundWebhookPreviewPayloadSchema = z
  .unknown()
  .refine((value) => isJsonbStorable(value), {
    message: "The payload is nested too deeply or contains unsupported text",
    abort: true,
  })
  .refine(
    (value) => utf8Bytes(value) <= INBOUND_WEBHOOK_LIMITS.maxPayloadBytes,
    {
      message: "The payload is too large",
    },
  )

export const inboundWebhookNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(INBOUND_WEBHOOK_LIMITS.maxNameLength)

/** The configuration a webhook is saved with (the editor's whole form). */
export const inboundWebhookConfigRequest = z.object({
  inboxResolution: inboundWebhookInboxResolutionSchema
    .nullable()
    .describe(
      'How the inbox is chosen: `{ mode: "inbox", inboxId }` for one fixed inbox, or `{ mode: "payload", channel, identifierKind, jsonPath }` to read the channel\'s own inbox id (Messenger page id, WhatsApp phone number id, …) from the payload. See `inboundWebhookChannels.list`.',
    ),
  identifiers: inboundWebhookIdentifiersSchema.describe(
    "JSON paths that identify the contact on that inbox: `channelUserId` (PSID, IGSID, …), `phone`, `email` and/or `fullName`, at least one. The contact is searched by the FIRST of them, in that order, that the request carries — never by the next one — and a new contact is created only from an identity the channel can address. Without a `creationIdentities` value of the channel (see `inboundWebhookChannels.list`) the webhook only updates existing contacts: a request for an unknown contact is skipped (`contactNotFound`). They are not written onto an existing contact; use `fieldMappings` for that.",
  ),
  fieldMappings: inboundWebhookFieldMappingsSchema.describe(
    "At least one. Payload values to save on the contact. `target` is a system field key (first_name, last_name, full_name, email, phone, gender) or a custom field id from `customFields.list`.",
  ),
  actions: z
    .array(inboundWebhookActionSchema)
    .max(INBOUND_WEBHOOK_LIMITS.maxActions)
    .describe("Actions to run, in order, after the contact is saved."),
  sampleJson: inboundWebhookSampleJsonSchema.describe(
    "An example request body, kept so the editor can browse its fields. Omit or null to clear it.",
  ),
})
export type InboundWebhookConfigRequest = z.infer<
  typeof inboundWebhookConfigRequest
>

export const createInboundWebhookRequest = z.object({
  name: inboundWebhookNameSchema.describe("Webhook name."),
})

export const updateInboundWebhookSettingsRequest = z.object({
  name: inboundWebhookNameSchema.optional().describe("New webhook name."),
  active: z
    .boolean()
    .optional()
    .describe("Whether the webhook accepts requests."),
})
