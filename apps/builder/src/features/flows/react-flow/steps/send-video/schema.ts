import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { buttonStepSchema } from "../button/schema"

export const sendVideoStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SendVideo),
  url: z.string().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: StepType.SendVideo,
  url: "",
  buttons: [],
})
