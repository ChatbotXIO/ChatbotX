import z from "zod"
import { containsVariablePlaceholder } from "./variables"

const DIGITS_REGEX = /^\d+$/

export const zodBigintAsString = (message?: string) =>
  z.string().regex(DIGITS_REGEX, message ? { message } : undefined)

/**
 * A URL field that may embed `{{variables}}` resolved at runtime. Accepts a
 * real URL, or any value containing a variable placeholder — the final URL is
 * only known after interpolation, so a variable-driven link like
 * `{{booking_link}}` must not be rejected at edit time. A plain non-URL string
 * with no variable still fails, keeping the original `z.url()` message.
 */
export const zodUrlWithVariables = (message = "Invalid URL") =>
  z
    .string()
    .refine(
      (value) =>
        containsVariablePlaceholder(value) || z.url().safeParse(value).success,
      { message },
    )
