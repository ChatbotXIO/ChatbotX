import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"
import { buttonStepSchema } from "./button"

export const sendAudioStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SEND_AUDIO),
  url: z.string().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendAudioStepSchema = z.infer<typeof sendAudioStepSchema>

export const sendAudioStepDefaultFn = (): SendAudioStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_AUDIO,
  url: "",
  buttons: [],
})
