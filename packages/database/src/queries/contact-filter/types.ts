import type { AnyColumn, SQL } from "drizzle-orm"

export type ContactFilterConditionInput = {
  field: string
  operator: string
  value?: unknown
  /** Present for dynamic custom-field conditions (`field === "customField"`). */
  customFieldId?: string
  /** Precise custom-field type (`date` | `datetime`) driving temporal semantics. */
  customFieldType?: string
  /** Form/value-input type of the custom field, used to cast the text value. */
  valueType?: string
  /** Present for dynamic coupon-topic conditions (`field === "couponTopic"`). */
  topicId?: string
  /** Present for `field === "ctwaRetarget"` conditions. */
  segment?: string
  /** Present for `field === "ctwaRetarget"` conditions. */
  adId?: string
  /** Present for `field === "ctwaRetarget"` conditions — scopes the segment to one WhatsApp integration. */
  integrationWhatsappId?: string
  /** Present for `field === "ctwaRetarget"` conditions (`YYYY-MM-DD`). */
  since?: string
  /** Present for `field === "ctwaRetarget"` conditions (`YYYY-MM-DD`). */
  until?: string
}

/**
 * `conditions` is typed `unknown[]` because the builder's Zod schema uses a
 * discriminated union with a `@ts-expect-error`, which degrades its inferred
 * element type. Each entry is validated by Zod at the request boundary, so it
 * is safely narrowed to {@link ContactFilterConditionInput} inside this module.
 */
export type ContactFilterCriteriaInput = {
  operator: "and" | "or"
  conditions: unknown[]
  /**
   * IANA timezone used to interpret naive date/datetime condition values (the
   * browser's local zone, captured at build/save time). Defaults to UTC when
   * absent or unrecognized. See {@link ./timezone.resolveFilterTimezone}.
   */
  timezone?: string
}

export type ContactWhere = Record<string, unknown>

export type ContactWhereInput = {
  workspaceId: string
  keyword?: string | null
  contactFilter?: ContactFilterCriteriaInput
}

export type RelationExists = (predicate?: SQL, negate?: boolean) => ContactWhere

export type RawTable = Record<string, AnyColumn>
