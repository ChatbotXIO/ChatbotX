import {
  contactIdentityKinds,
  inboxIdentifierKinds,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { formatJsonPath, parseJsonPath } from "@chatbotx.io/utils/json-path"
import { zodBigintAsString } from "@chatbotx.io/utils/zod"
import z from "zod"
import { channelTypes } from "./channel"
import { triggerActions } from "./trigger"

/** Bounds that keep one saved config and one accepted request cheap to run. */
export const INBOUND_WEBHOOK_LIMITS = {
  maxWebhooksPerWorkspace: 100,
  maxIdentifiers: 4,
  maxFieldMappings: 50,
  maxActions: 10,
  maxJsonPathLength: 500,
  maxNameLength: 255,
  maxSampleJsonBytes: 64 * 1024,
  maxPayloadBytes: 256 * 1024,
  maxIdempotencyKeyLength: 255,
  maxUserAgentLength: 512,
  maxErrorMessageLength: 1024,
} as const

export const inboundWebhookRequestStatusValues = [
  "received",
  "processing",
  "processed",
  "completedWithErrors",
  "skipped",
  "failed",
] as const
export const inboundWebhookRequestStatuses = z.enum(
  inboundWebhookRequestStatusValues,
)
export type InboundWebhookRequestStatus = z.infer<
  typeof inboundWebhookRequestStatuses
>

/** Statuses a request ends in; `received`/`processing` are in-flight. */
export const inboundWebhookTerminalStatuses =
  inboundWebhookRequestStatuses.exclude(["received", "processing"])
export type InboundWebhookTerminalStatus = z.infer<
  typeof inboundWebhookTerminalStatuses
>

export const inboundWebhookSkipReasons = z.enum([
  "webhookInactive",
  "missingInboxIdentifier",
  "inboxNotFound",
  "inboxAmbiguous",
  "inboxDisconnected",
  "missingIdentifier",
  "contactNotFound",
  "contactAmbiguous",
  "workspaceBlocked",
])
export type InboundWebhookSkipReason = z.infer<typeof inboundWebhookSkipReasons>

/** The trigger actions an inbound webhook may run (a subset of `triggerActions`). */
export const inboundWebhookActionTypes = triggerActions.extract([
  "startAnotherFlow",
  "addTag",
  "removeTag",
  "setCustomField",
  "clearCustomField",
  "transferConversationToHuman",
])
export type InboundWebhookActionType = z.infer<typeof inboundWebhookActionTypes>

/** A stored action: its `type` plus the per-type fields the trigger editor owns. */
export type InboundWebhookAction = {
  type: InboundWebhookActionType
  [field: string]: unknown
}

export const INBOUND_WEBHOOK_UNSUPPORTED_PATH_MESSAGE = "Unsupported JSON path"

/**
 * A JSONPath this feature can evaluate (`$` alone, the whole payload, is not a
 * value). Any accepted spelling (`$.a.b`, `$["a-b"]`, bare `a.b`) is stored in
 * the canonical `$` form, so what a saved config shows never depends on how it
 * was typed.
 */
export const inboundWebhookJsonPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(INBOUND_WEBHOOK_LIMITS.maxJsonPathLength)
  .transform((path, ctx): string => {
    const segments = parseJsonPath(path)
    if (!segments || segments.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: INBOUND_WEBHOOK_UNSUPPORTED_PATH_MESSAGE,
      })
      return z.NEVER
    }
    return formatJsonPath(segments)
  })
  // The canonical form can be longer than what was typed, so the limit is
  // enforced on what is stored. A plain-string output also keeps the generated
  // public spec typed (a bare transform reads as an untyped output).
  .pipe(z.string().max(INBOUND_WEBHOOK_LIMITS.maxJsonPathLength))

/**
 * The path-carrying schemas exist twice: the write side canonicalises and
 * limits a path, the stored side only describes what is already saved. A
 * response must not re-validate a row saved in another spelling (a legacy
 * 500-character bare path is 502 characters in the `$` form), so reads use the
 * stored side.
 */
const inboxResolutionSchemaFor = <TPath extends z.ZodType<string>>(
  jsonPath: TPath,
) =>
  z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("inbox"),
      inboxId: zodBigintAsString(),
    }),
    z.object({
      mode: z.literal("payload"),
      channel: channelTypes,
      identifierKind: inboxIdentifierKinds,
      jsonPath,
    }),
  ])
const identifierSchemaFor = <TPath extends z.ZodType<string>>(
  jsonPath: TPath,
) => z.object({ kind: contactIdentityKinds, jsonPath })

export const inboundWebhookInboxResolutionSchema = inboxResolutionSchemaFor(
  inboundWebhookJsonPathSchema,
)
export const inboundWebhookStoredInboxResolutionSchema =
  inboxResolutionSchemaFor(z.string())
export type InboundWebhookInboxResolution = z.infer<
  typeof inboundWebhookInboxResolutionSchema
>

export const inboundWebhookIdentifierSchema = identifierSchemaFor(
  inboundWebhookJsonPathSchema,
)
export const inboundWebhookStoredIdentifierSchema = identifierSchemaFor(
  z.string(),
)
export type InboundWebhookIdentifier = z.infer<
  typeof inboundWebhookIdentifierSchema
>

export const inboundWebhookIdentifiersSchema = z
  .array(inboundWebhookIdentifierSchema)
  .max(INBOUND_WEBHOOK_LIMITS.maxIdentifiers)
  .refine(
    (identifiers) =>
      new Set(identifiers.map((identifier) => identifier.kind)).size ===
      identifiers.length,
    { message: "Each identity kind can be configured once" },
  )

export const inboundWebhookStructuralIssueCodes = [
  "inboxRequired",
  "identifierRequired",
  "fieldMappingRequired",
] as const
export type InboundWebhookStructuralIssueCode =
  (typeof inboundWebhookStructuralIssueCodes)[number]

/**
 * What a saved webhook must contain to be usable: an inbox rule, at least one
 * identity path and at least one mapping. Pure, so the editor (to enable
 * activation) and the service (to enforce it) apply one definition.
 */
export const listInboundWebhookStructuralIssues = (config: {
  inboxResolution: InboundWebhookInboxResolution | null
  identifiers: readonly unknown[]
  fieldMappings: readonly unknown[]
}): InboundWebhookStructuralIssueCode[] => [
  ...(config.inboxResolution ? [] : (["inboxRequired"] as const)),
  ...(config.identifiers.length > 0 ? [] : (["identifierRequired"] as const)),
  ...(config.fieldMappings.length > 0
    ? []
    : (["fieldMappingRequired"] as const)),
]

/** `target` is a system-field key or a custom-field id, as on lead-ads mappings. */
const fieldMappingSchemaFor = <TPath extends z.ZodType<string>>(
  jsonPath: TPath,
) => z.object({ jsonPath, target: z.string().trim().min(1).max(255) })

export const inboundWebhookFieldMappingSchema = fieldMappingSchemaFor(
  inboundWebhookJsonPathSchema,
)
export const inboundWebhookStoredFieldMappingSchema = fieldMappingSchemaFor(
  z.string(),
)
export type InboundWebhookFieldMapping = z.infer<
  typeof inboundWebhookFieldMappingSchema
>

export const inboundWebhookFieldMappingsSchema = z
  .array(inboundWebhookFieldMappingSchema)
  .max(INBOUND_WEBHOOK_LIMITS.maxFieldMappings)

/**
 * Prefix of the capability token in an inbound webhook URL. Brand-neutral: the
 * URL is shown to white-label tenants' customers.
 */
export const INBOUND_WEBHOOK_TOKEN_PREFIX = "iwh_"

/** How a mapped target is written: gender, a contact system field, or a custom field. */
export const inboundWebhookMappedFieldKinds = z.enum([
  "gender",
  "richSystem",
  "customField",
])
export type InboundWebhookMappedFieldKind = z.infer<
  typeof inboundWebhookMappedFieldKinds
>

/** Why a mapped value was not written. */
export const inboundWebhookFieldErrorCodes = z.enum([
  "unknownField",
  "invalidValue",
  "invalidPhone",
])
export type InboundWebhookFieldErrorCode = z.infer<
  typeof inboundWebhookFieldErrorCodes
>

/** `errorCode` values the pipeline itself records; a business failure records its own code. */
export const INBOUND_WEBHOOK_REQUEST_ERROR_CODE = {
  abandoned: "abandoned",
  systemError: "systemError",
} as const

export const inboundWebhookFieldErrorSchema = z.object({
  target: z.string(),
  code: z.string(),
})
export type InboundWebhookFieldError = z.infer<
  typeof inboundWebhookFieldErrorSchema
>

export const inboundWebhookActionResultSchema = z.object({
  index: z.number().int().nonnegative(),
  type: z.string(),
  status: z.enum(["succeeded", "skipped", "failed"]),
  reason: z.string().optional(),
  error: z
    .string()
    .max(INBOUND_WEBHOOK_LIMITS.maxErrorMessageLength)
    .optional(),
})
export type InboundWebhookActionResult = z.infer<
  typeof inboundWebhookActionResultSchema
>
