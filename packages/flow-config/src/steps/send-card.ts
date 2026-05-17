import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { stepTypes } from "./step-action"

export const sendCardStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendCard),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(80).optional(),
  image: sendImageStepSchema
    .extend({
      url: z.url().or(z.literal("")),
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
