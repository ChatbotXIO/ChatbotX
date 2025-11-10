import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { StepType } from "./step-action"

export const sendCardStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.sendCard),
  title: z.string().trim().min(1).max(255),
  subtitle: z.string().trim().max(255).optional(),
  image: sendImageStepSchema.optional(),
  buttons: z.array(buttonStepSchema),
})

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: StepType.sendCard,
  title: "",
  subtitle: "",
  image: sendImageStepDefaultFn(),
  buttons: [],
})
