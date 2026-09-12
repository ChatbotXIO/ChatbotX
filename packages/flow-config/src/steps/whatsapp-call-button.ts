import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * "Call on WhatsApp" step — sends Meta's `voice_call` interactive message:
 * a body text plus one tap-to-call button that starts a WhatsApp call to
 * the business number. Limits follow the Cloud API reference
 * (`display_text` ≤ 20 chars, interactive body ≤ 1024 chars).
 */
export const WHATSAPP_CALL_BUTTON_BODY_MAX = 1024
export const WHATSAPP_CALL_BUTTON_LABEL_MAX = 20

export const whatsappCallButtonStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.whatsappCallButton),
  text: z.string().trim().min(1).max(WHATSAPP_CALL_BUTTON_BODY_MAX),
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_CALL_BUTTON_LABEL_MAX),
})

export type WhatsappCallButtonStepSchema = z.infer<
  typeof whatsappCallButtonStepSchema
>

export const whatsappCallButtonLabelFormSchema = z.object({
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_CALL_BUTTON_LABEL_MAX),
})
export type WhatsappCallButtonLabelFormValues = z.infer<
  typeof whatsappCallButtonLabelFormSchema
>

export const whatsappCallButtonStepDefaultFn = (
  props: Partial<WhatsappCallButtonStepSchema> = {},
): WhatsappCallButtonStepSchema => ({
  text: "",
  buttonLabel: "Call Now",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.whatsappCallButton,
})
