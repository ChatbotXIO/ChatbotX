import { parseConversionTime } from "@chatbotx.io/utils/google-click"
import {
  metaCapiCurrencySchema,
  metaCapiValueSchema,
} from "@chatbotx.io/utils/meta-capi"
import { z } from "zod"

/** Value and currency are sent together or not at all; both reuse the Meta CAPI validators. */
export const conversionValueSchema = z
  .object({
    value: metaCapiValueSchema.optional(),
    currency: metaCapiCurrencySchema.optional(),
  })
  .refine(
    ({ value, currency }) => (value === undefined) === (currency === undefined),
    {
      message: "Value and currency must be provided together",
    },
  )

const DEDUP_ID_MAX_LENGTH = 64
const UNRESOLVED_PLACEHOLDER = "{{"

/** Template resolution can leave an empty/whitespace string; treat it as "not provided". */
const blankToUndefined = (input: unknown): unknown =>
  typeof input === "string" && input.trim() === "" ? undefined : input

export type ResolvedDedupId =
  | { status: "ok"; id: string }
  /** Empty, whitespace, or a template that never resolved. */
  | { status: "missing" }
  | { status: "invalid" }

/** The business ID after `{{variable}}` resolution: trimmed, 1..64, no leftover placeholder. */
export const resolvedDedupIdSchema = z
  .string()
  .optional()
  .transform((raw): ResolvedDedupId => {
    const id = raw?.trim() ?? ""
    if (id === "" || id.includes(UNRESOLVED_PLACEHOLDER)) {
      return { status: "missing" }
    }
    return id.length > DEDUP_ID_MAX_LENGTH
      ? { status: "invalid" }
      : { status: "ok", id }
  })

export type ResolvedConversionTime =
  /** `time` is `undefined` when the field was blank (use the recorded time). */
  { status: "ok"; time: Date | undefined } | { status: "malformed" | "future" }

/**
 * The conversion time after resolution: blank is absent; otherwise an RFC 3339
 * date-time with a zone that is not after `validationNow`. No other bound:
 * Google is authoritative about how old a conversion may be.
 */
export const resolvedConversionTimeSchema = (validationNow: Date) =>
  z
    .string()
    .optional()
    .transform((raw): ResolvedConversionTime => {
      const text = raw?.trim() ?? ""
      if (text === "") {
        return { status: "ok", time: undefined }
      }
      const time = parseConversionTime(text)
      if (!time) {
        return { status: "malformed" }
      }
      return time.getTime() > validationNow.getTime()
        ? { status: "future" }
        : { status: "ok", time }
    })

/** Value and currency after template resolution; blank strings are absent. */
export const resolvedConversionValueSchema = z.preprocess(
  (input) =>
    typeof input === "object" && input !== null
      ? Object.fromEntries(
          Object.entries(input).map(([key, entry]) => [
            key,
            blankToUndefined(entry),
          ]),
        )
      : input,
  conversionValueSchema,
)
