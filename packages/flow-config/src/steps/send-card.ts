import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { CARD_BUTTON_MAX } from "./button-limits"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { stepTypes } from "./step-action"

export const sendCardStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendCard)
    .describe('Step type discriminator: "sendCard".'),
  title: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => countMessageCharacters(value) <= 80,
      "Card titles must be 80 characters or fewer.",
    ),
  subtitle: z
    .string()
    .trim()
    .refine(
      (value) => countMessageCharacters(value) <= 80,
      "Card subtitles must be 80 characters or fewer.",
    )
    .optional(),
  image: sendImageStepSchema
    .extend({
      url: zodUrlWithVariables().or(z.literal("")),
    })
    .optional(),
  buttons: z
    .array(buttonStepSchema)
    .max(CARD_BUTTON_MAX)
    .describe(
      "Buttons on the card (use [] for none). The limit depends on the channel: see `limits.cardButtonCount` of the channel's policy.",
    ),
})

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendCard,
  title: "",
  subtitle: "",
  image: sendImageStepDefaultFn(),
  buttons: [],
})
