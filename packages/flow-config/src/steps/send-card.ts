import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/send-text-length-rules"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { stepTypes } from "./step-action"

export const sendCardStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendCard),
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
  buttons: z.array(buttonStepSchema).max(3),
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
