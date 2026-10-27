import { PIPELINE_DATE_RANGE } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { ianaTimezoneSchema } from "@/lib/public-api/iana-timezone"

/** A coerced date the database can compare against. */
export const boundedDate = () =>
  z.coerce.date().min(PIPELINE_DATE_RANGE.min).max(PIPELINE_DATE_RANGE.max)

const NUL = "\u0000"

/** Postgres text rejects NUL (22021), so it must never reach SQL. */
export const hasNoNul = (value: string) => !value.includes(NUL)
export const NO_NUL_MESSAGE = "Text cannot contain NUL characters"

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Inclusive `YYYY-MM-DD` range plus IANA zone shared by the private and public stats requests. */
export const statsRangeFields = {
  from: z.string().regex(DATE_KEY_PATTERN, "Use YYYY-MM-DD"),
  to: z.string().regex(DATE_KEY_PATTERN, "Use YYYY-MM-DD"),
  timezone: ianaTimezoneSchema.optional(),
}

/** Longest custom-field value / filter value accepted. */
export const MAX_FIELD_VALUE_LENGTH = 5000
/** Custom-field values writable in one request. */
export const MAX_FIELD_VALUES = 100
/** Custom-field filters accepted in one board filter. */
export const MAX_FIELD_FILTERS = 20
