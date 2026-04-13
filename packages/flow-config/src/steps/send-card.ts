import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { stepTypes } from "./step-action"

export const sendCardStepSchema = baseStepSchema
  .extend({
    stepType: z.literal(stepTypes.enum.sendCard),
    title: z.string().trim().min(1).max(255),
  })
  .and(
    z.union([
      z.object({
        subtitle: z.string().trim().min(1).max(255),
      }),
      z.object({
        image: sendImageStepSchema,
      }),
      z.object({
        buttons: z.array(buttonStepSchema).min(1).max(3),
      }),
    ]),
  )

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendCard,
  title: "",
  subtitle: "",
  image: sendImageStepDefaultFn(),
  buttons: [],
})
