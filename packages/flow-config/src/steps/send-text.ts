import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  countMessageCharacters,
  SEND_TEXT_MAX,
} from "../channel-rules/send-text-length-rules"
import { flowValidationCodes } from "../validation-codes"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

/**
 * The schema caps at the widest limit any channel accepts, because it has no
 * channel to check — the author's actual limit is enforced per channel by
 * `refineSendTextLengthForChannel`, wired into `sendTextValidator`.
 *
 * Measured with `countMessageCharacters`, not `.max()`: zod counts UTF-16 code
 * units, so an emoji built from a surrogate pair would count twice here while
 * the editor's counter and every per-channel rule count it once. An emoji-heavy
 * message would then read `3500/6000` in the editor and still fail this cap.
 * Raising the shared code keeps that failure mapped to `messages.<code>` rather
 * than surfacing a raw zod "too big" string.
 *
 * The check stays on the field: wrapping the object in a `superRefine` would
 * make it a ZodEffects and break the `z.discriminatedUnion("stepType", …)` that
 * `sendMessageNodeSchema` builds from it.
 */
export const sendTextStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendText),
  text: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => countMessageCharacters(value) <= SEND_TEXT_MAX,
      flowValidationCodes.sendTextTooLongForChannel,
    ),
  buttons: z.array(buttonStepSchema),
})

export type SendTextStepSchema = z.infer<typeof sendTextStepSchema>

export const sendTextStepDefaultFn = (
  props: Partial<SendTextStepSchema> = {},
): SendTextStepSchema => ({
  text: "",
  buttons: [],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendText,
})
