import type { AnyColumn, SQL } from "drizzle-orm"

export type ContactFilterConditionInput = {
  field: string
  operator: string
  value?: unknown
  /** Present for dynamic custom-field conditions (`field === "customField"`). */
  customFieldId?: string
  /** Form/value-input type of the custom field, used to cast the text value. */
  valueType?: string
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
}

export type ContactWhere = Record<string, unknown>

export type ContactWhereInput = {
  workspaceId: string
  keyword?: string | null
  contactFilter?: ContactFilterCriteriaInput
}

export type RelationExists = (predicate?: SQL, negate?: boolean) => ContactWhere

export type RawTable = Record<string, AnyColumn>
