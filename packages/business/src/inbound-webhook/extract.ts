import {
  type ChannelType,
  type CustomFieldType,
  genderTypes,
  type InboundWebhookFieldErrorCode,
  type InboundWebhookFieldMapping,
  type InboundWebhookIdentifier,
  type InboundWebhookInboxResolution,
  type InboundWebhookMappedFieldKind,
} from "@chatbotx.io/database/partials"
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import type { ContactIdentityKind } from "@chatbotx.io/utils/inbound-webhook-channel"
import {
  readJsonPath,
  stringifyJsonPathValue,
} from "@chatbotx.io/utils/json-path"
import z from "zod"
import {
  type ContactInboxIdentities,
  type ContactLookupKey,
  IDENTITY_FIELD,
  selectContactLookup,
} from "../contact/contact-inbox-identity"
import { normalizeIdentityPhoneToE164 } from "../contact/phone"
import { isRichSystemContactField } from "../contact/service"
import { normalizeCustomFieldValueForStorage } from "../contact-custom-field/normalize"
import { ChatbotXException } from "../errors"

const MAX_CHANNEL_USER_ID_LENGTH = 255
const MAX_FULL_NAME_LENGTH = 255
const EDGE_SPACE = /^ | $/g
// The ASCII set, spelled out: it is exactly the class the database side
// (`normalizedFullNameSql`) collapses, so both sides agree on what a space is.
const WHITESPACE_RUN = /[ \t\n\v\f\r]+/g
const emailSchema = z.email()
const resolveUtc = () => Promise.resolve("UTC")

export type MappedFieldKind = InboundWebhookMappedFieldKind

export type ExtractedField = {
  target: string
  kind: MappedFieldKind
  /** What the path pointed at, as text; `null` when nothing was there. */
  raw: string | null
  /** The value to write; `null` when skipped or rejected. */
  value: string | null
  error: InboundWebhookFieldErrorCode | null
}

export type ExtractedIdentifier = {
  kind: ContactIdentityKind
  raw: string | null
  /** The identity after normalisation; `null` when missing or malformed. */
  normalized: string | null
}

export type ExtractedInboundWebhookValues = {
  /** The channel's external inbox id (`payload` mode only). */
  inboxIdentifier: string | null
  identifiers: ExtractedIdentifier[]
  /** The usable identities, keyed the way contact lookup/creation expects. */
  identities: ContactInboxIdentities
  /** What the contact would be searched by; `null` when no identity is usable. */
  contactLookup: ContactLookupKey | null
  fields: ExtractedField[]
}

type ExtractContext = {
  targetCountry: string | null | undefined
  customFieldTypeById: ReadonlyMap<string, CustomFieldType>
}

const toText = (value: unknown): string | null =>
  stringifyJsonPathValue(value)?.trim() || null

const readText = (payload: unknown, jsonPath: string): string | null =>
  toText(readJsonPath(payload, jsonPath))

/**
 * An id sent as a JSON number beyond 2^53 was already rounded by `JSON.parse`,
 * so it names a different account. Treating it as absent skips the request
 * instead of creating a contact for an id that does not exist. Senders must
 * send such ids as strings.
 */
const readIdentifierText = (
  payload: unknown,
  jsonPath: string,
): string | null => {
  const value = readJsonPath(payload, jsonPath)
  return typeof value === "number" && !Number.isSafeInteger(value)
    ? null
    : toText(value)
}

const IDENTITY_NORMALIZERS: Record<
  ContactIdentityKind,
  (raw: string, context: ExtractContext) => string | null
> = {
  channelUserId: (raw) =>
    raw.length <= MAX_CHANNEL_USER_ID_LENGTH ? raw : null,
  phone: (raw, { targetCountry }) =>
    normalizeIdentityPhoneToE164(raw, targetCountry),
  email: (raw) => (emailSchema.safeParse(raw).success ? raw : null),
  fullName: (raw) => {
    const collapsed = raw.replace(WHITESPACE_RUN, " ").replace(EDGE_SPACE, "")
    return collapsed.length > 0 && collapsed.length <= MAX_FULL_NAME_LENGTH
      ? collapsed
      : null
  },
}

const extractIdentifier = (
  payload: unknown,
  identifier: InboundWebhookIdentifier,
  context: ExtractContext,
): ExtractedIdentifier => {
  const raw = readIdentifierText(payload, identifier.jsonPath)
  return {
    kind: identifier.kind,
    raw,
    normalized: raw
      ? IDENTITY_NORMALIZERS[identifier.kind](raw, context)
      : null,
  }
}

const toIdentities = (
  identifiers: ExtractedIdentifier[],
): ContactInboxIdentities =>
  Object.fromEntries(
    identifiers.flatMap(({ kind, normalized }) =>
      normalized ? [[IDENTITY_FIELD[kind], normalized] as const] : [],
    ),
  )

export const classifyMappedTarget = (target: string): MappedFieldKind => {
  if (target === "gender") {
    return "gender"
  }
  return isRichSystemContactField(target) ? "richSystem" : "customField"
}

type Coerced = Pick<ExtractedField, "value" | "error">

/** Same acceptance rule the writer applies, minus the timezone-dependent value. */
const checkCustomFieldValue = async (
  type: CustomFieldType,
  raw: string,
): Promise<Coerced> => {
  try {
    const normalized = await normalizeCustomFieldValueForStorage({
      type,
      value: raw,
      resolveSourceTimezone: resolveUtc,
      temporalInputParsing: TemporalInputParsing.Lenient,
    })
    return normalized === null
      ? { value: null, error: "invalidValue" }
      : { value: raw, error: null }
  } catch (error) {
    if (error instanceof ChatbotXException) {
      return { value: null, error: "invalidValue" }
    }
    throw error
  }
}

const coercePhone = (
  raw: string,
  targetCountry: string | null | undefined,
): Coerced => {
  const e164 = normalizeIdentityPhoneToE164(raw, targetCountry)
  return e164
    ? { value: e164, error: null }
    : { value: null, error: "invalidPhone" }
}

/** System fields whose value must be validated; every other one is written as sent. */
const RICH_SYSTEM_COERCERS: Partial<
  Record<string, (raw: string, context: ExtractContext) => Coerced>
> = {
  phone: (raw, { targetCountry }) => coercePhone(raw, targetCountry),
  phone_number: (raw, { targetCountry }) => coercePhone(raw, targetCountry),
  email: (raw) =>
    emailSchema.safeParse(raw).success
      ? { value: raw, error: null }
      : { value: null, error: "invalidValue" },
}

const FIELD_COERCERS: Record<
  MappedFieldKind,
  (
    target: string,
    raw: string,
    context: ExtractContext,
  ) => Promise<Coerced> | Coerced
> = {
  gender: (_target, raw) => {
    const gender = raw.toLowerCase()
    return (genderTypes.options as readonly string[]).includes(gender)
      ? { value: gender, error: null }
      : { value: null, error: "invalidValue" }
  },
  richSystem: (target, raw, context) =>
    RICH_SYSTEM_COERCERS[target]?.(raw, context) ?? { value: raw, error: null },
  customField: (target, raw, { customFieldTypeById }) => {
    const type = customFieldTypeById.get(target)
    return type
      ? checkCustomFieldValue(type, raw)
      : { value: null, error: "unknownField" }
  },
}

const extractField = async (
  payload: unknown,
  mapping: InboundWebhookFieldMapping,
  context: ExtractContext,
): Promise<ExtractedField> => {
  const kind = classifyMappedTarget(mapping.target)
  const raw = readText(payload, mapping.jsonPath)
  if (raw === null) {
    return { target: mapping.target, kind, raw, value: null, error: null }
  }
  const coerced = await FIELD_COERCERS[kind](mapping.target, raw, context)
  return { target: mapping.target, kind, raw, ...coerced }
}

/**
 * Reads everything a request carries out of its JSON body, without writing
 * anything: the inbox identifier, the contact identities and every mapped
 * field with the verdict the writer would give it. The worker and the
 * `previewMapping` API both call this, so a preview shows exactly what a real
 * delivery would do.
 */
export const extractInboundWebhookValues = async (input: {
  payload: unknown
  inboxResolution: InboundWebhookInboxResolution | null
  identifiers: InboundWebhookIdentifier[]
  fieldMappings: InboundWebhookFieldMapping[]
  targetCountry: string | null | undefined
  customFieldTypeById: ReadonlyMap<string, CustomFieldType>
  /** The channel the contact lives on, when known; refines `contactLookup`. */
  channel?: ChannelType | null
}): Promise<ExtractedInboundWebhookValues> => {
  const { payload, inboxResolution, identifiers, fieldMappings } = input
  const context: ExtractContext = {
    targetCountry: input.targetCountry,
    customFieldTypeById: input.customFieldTypeById,
  }
  const extractedIdentifiers = identifiers.map((identifier) =>
    extractIdentifier(payload, identifier, context),
  )
  const identities = toIdentities(extractedIdentifiers)
  return {
    inboxIdentifier:
      inboxResolution?.mode === "payload"
        ? readIdentifierText(payload, inboxResolution.jsonPath)
        : null,
    identifiers: extractedIdentifiers,
    identities,
    contactLookup: selectContactLookup(identities, input.channel ?? null),
    fields: await Promise.all(
      fieldMappings.map((mapping) => extractField(payload, mapping, context)),
    ),
  }
}

export const toFieldErrors = (
  fields: ExtractedField[],
): { target: string; code: InboundWebhookFieldErrorCode }[] =>
  fields.flatMap(({ target, error }) =>
    error ? [{ target, code: error }] : [],
  )
