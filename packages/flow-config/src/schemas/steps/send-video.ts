import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendVideoStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SEND_VIDEO),
  url: z.string().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_VIDEO,
  url: "",
  buttons: [],
})
