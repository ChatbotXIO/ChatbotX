import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { StepType } from "./step-action"

export const sendCardStepSchema = z
  .object({
    id: z.string(),
    stepType: z.literal(StepType.sendCard),
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
  stepType: StepType.sendCard,
  title: "",
  subtitle: "",
  image: sendImageStepDefaultFn(),
  buttons: [],
})
