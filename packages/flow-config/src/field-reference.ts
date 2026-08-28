import { z } from "zod"

/**
 * Shared, channel-agnostic model for a "field reference" value stored on flow
 * steps and trigger actions (e.g. `inputFieldId`, `customFieldId`).
 *
 * Historically these slots stored either a `ContactCustomField` id or its
 * name (legacy name-lookup, still supported by `contactCustomFieldService`).
 * Account Fields (`BotField`) reuse the same slots via a prefixed reference
 * token — `bot_field:<id>` — so the remap engine (which classifies scalar
 * reference slots by key name, not by value shape) can tell the two kinds
 * apart without misrouting a raw numeric bot-field id against the customField
 * idMap on template install / flow import.
 *
 * Pure module: no channel-specific logic, no database/business imports.
 */

export const FieldReferenceKind = {
  customField: "customField",
  botField: "botField",
} as const

export type FieldReferenceKind =
  (typeof FieldReferenceKind)[keyof typeof FieldReferenceKind]

/** Token form: `bot_field:<id>`. */
export const BOT_FIELD_REFERENCE_PREFIX = "bot_field"

const BOT_FIELD_REFERENCE_SEPARATOR = ":"

/** e.g. `bot_field:` — anything starting with this is a reserved token shape. */
const RESERVED_FIELD_REFERENCE_PREFIX = `${BOT_FIELD_REFERENCE_PREFIX}${BOT_FIELD_REFERENCE_SEPARATOR}`

/** Matches a well-formed bot-field token, capturing the numeric id. */
const BOT_FIELD_REFERENCE_PATTERN = new RegExp(
  `^${BOT_FIELD_REFERENCE_PREFIX}${BOT_FIELD_REFERENCE_SEPARATOR}(\\d+)$`,
)

export type FieldReference =
  // id or name (legacy behavior) — resolved by contactCustomFieldService
  | { kind: typeof FieldReferenceKind.customField; key: string }
  | { kind: typeof FieldReferenceKind.botField; id: string }

/**
 * Parses a stored field-reference value. Anything matching the well-formed
 * `bot_field:<id>` token shape is a bot-field reference; everything else
 * (a numeric id, a field name, or any other legacy value) is treated as a
 * customField key, preserving today's id-or-name lookup behavior byte for
 * byte.
 */
export const parseFieldReference = (raw: string): FieldReference => {
  const match = BOT_FIELD_REFERENCE_PATTERN.exec(raw)

  if (match) {
    const id = match[1]
    if (id) {
      return { kind: FieldReferenceKind.botField, id }
    }
  }

  return { kind: FieldReferenceKind.customField, key: raw }
}

/** Formats a bot-field id into its stored reference token. */
export const formatBotFieldReference = (id: string): string =>
  `${BOT_FIELD_REFERENCE_PREFIX}${BOT_FIELD_REFERENCE_SEPARATOR}${id}`

/** True only for a well-formed `bot_field:<id>` token. */
export const isBotFieldReference = (raw: string): boolean =>
  BOT_FIELD_REFERENCE_PATTERN.test(raw)

/**
 * A field-reference slot (`inputFieldId`, `customFieldId`, ...). Accepts any
 * non-empty string — including legacy field names containing spaces or
 * colons — EXCEPT a value that starts with the reserved `bot_field:` prefix
 * but is not a valid token (e.g. `bot_field:` or `bot_field:abc`), which
 * would otherwise silently misroute at the backend or the remap engine.
 */
export const zodFieldReference = (
  message = `Value starting with "${RESERVED_FIELD_REFERENCE_PREFIX}" must be a valid bot field reference (e.g. "${formatBotFieldReference("123")}").`,
) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        !value.startsWith(RESERVED_FIELD_REFERENCE_PREFIX) ||
        BOT_FIELD_REFERENCE_PATTERN.test(value),
      { message },
    )

/** True when a field NAME would collide with the reference-token shape. */
export const isReservedFieldName = (name: string): boolean =>
  name.startsWith(RESERVED_FIELD_REFERENCE_PREFIX)

/**
 * Shared `name` schema for CustomField / BotField create & update requests.
 * Rejects any name starting with the reserved `bot_field:` prefix so a field
 * can never be named in a way that collides with a reference token — single
 * source of truth for the create/update schemas on both field kinds.
 */
export const zodFieldName = (
  message = `Name must not start with the reserved "${RESERVED_FIELD_REFERENCE_PREFIX}" prefix.`,
) =>
  z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !isReservedFieldName(name), { message })
