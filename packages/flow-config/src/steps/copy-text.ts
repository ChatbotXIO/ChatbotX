import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { flowValidationCodes } from "../validation-codes"
import { stepTypes } from "./step-action"

/** Longest text a Telegram `copy_text` button copies (Bot API `CopyTextButton.text`). */
export const COPY_TEXT_MAX = 256

/**
 * Longest authored value that contains a `{{variable}}`. Variable tokens
 * (`{{bot_field:<id>}}`) are longer or shorter than what they resolve to, so
 * only the resolved value is held to `COPY_TEXT_MAX`, at send time.
 */
export const COPY_TEXT_EXPRESSION_MAX = 1000

/** Whether a resolved value can be sent as a native copy button. */
export const isCopyableText = (value: string): boolean => {
  const length = countMessageCharacters(value)
  return length > 0 && length <= COPY_TEXT_MAX
}

const isValidAuthoredCopyText = (value: string): boolean =>
  containsVariablePlaceholder(value)
    ? value.length <= COPY_TEXT_EXPRESSION_MAX
    : countMessageCharacters(value) <= COPY_TEXT_MAX

export const copyTextStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.copyText)
    .describe('Step type discriminator: "copyText".'),
  text: z
    .string()
    .trim()
    .min(1)
    .refine(isValidAuthoredCopyText, flowValidationCodes.constraintExceeded)
    .meta({
      description: `Text the button copies to the contact's clipboard (max ${COPY_TEXT_MAX} characters once variables are resolved), e.g. a PIX "copia e cola" code. May embed {{variables}} (max ${COPY_TEXT_EXPRESSION_MAX} characters authored).`,
    }),
})

export type CopyTextStepSchema = z.infer<typeof copyTextStepSchema>

export const copyTextStepDefaultFn = (): CopyTextStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.copyText,
  text: "",
})
