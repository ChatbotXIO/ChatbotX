import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import { stepTypes } from "./step-action"

const PHONE_SEPARATORS = /[\s\-.()]/g
const INTERNATIONAL_NUMBER = /^\+\d+$/

/**
 * Longest authored value that contains a `{{variable}}`. Variable tokens
 * (`{{bot_field:<id>}}`) are far longer than the number they resolve to, so
 * only the resolved value is validated as a number, at send time.
 */
export const PHONE_NUMBER_EXPRESSION_MAX = 100

/** The value without spaces, dashes, dots and brackets (`+1 (415) 555-2671` → `+14155552671`). */
export const compactPhoneNumber = (value: string): string =>
  value.replace(PHONE_SEPARATORS, "")

/**
 * The E.164 form of a whole value that must be a complete, real international
 * number, or `null`. Stricter than contact extraction on purpose: that parser
 * hunts for digit runs inside free text and guesses regions, while a dial
 * target must be exactly one number — surrounding junk, an unresolved
 * `{{token}}`, a missing `+` or a national format all mean "do not dial".
 */
export const normalizeDialablePhoneNumber = (value: string): string | null => {
  const compact = compactPhoneNumber(value)
  if (!INTERNATIONAL_NUMBER.test(compact)) {
    return null
  }
  const parsed = parsePhoneNumberFromString(compact)
  return parsed?.isValid() ? parsed.number : null
}

/** Whether a value is already a valid number in canonical E.164 form. */
const isE164PhoneNumber = (value: string): boolean =>
  normalizeDialablePhoneNumber(value) === value

/**
 * An authored phone number is either a literal in E.164 form or an expression
 * embedding `{{variables}}` that resolves to one at send time. A literal is
 * validated here with the same rule the worker applies to the resolved value.
 */
const isValidAuthoredPhoneNumber = (value: string): boolean =>
  containsVariablePlaceholder(value)
    ? value.length <= PHONE_NUMBER_EXPRESSION_MAX
    : isE164PhoneNumber(value)

export const callPhoneNumberStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.callPhoneNumber)
    .describe('Step type discriminator: "callPhoneNumber".'),
  phoneNumber: z
    .string()
    .trim()
    .refine(isValidAuthoredPhoneNumber, flowValidationCodes.invalidPhoneNumber)
    .meta({
      description: `Number the button dials, in international format (E.164, e.g. +14155552671). May embed {{variables}} (max ${PHONE_NUMBER_EXPRESSION_MAX} characters) that resolve to such a number when the message is sent.`,
    }),
})

export type CallPhoneNumberStepSchema = z.infer<
  typeof callPhoneNumberStepSchema
>

export const callPhoneNumberStepDefaultFn = (): CallPhoneNumberStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.callPhoneNumber,
  phoneNumber: "",
})
