import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { buttonStepSchema } from "../button/schema"

export const sendAudioStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SendAudio),
  url: z.string().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendAudioStepSchema = z.infer<typeof sendAudioStepSchema>

export const sendAudioStepDefaultFn = (): SendAudioStepSchema => ({
  id: createId(),
  stepType: StepType.SendAudio,
  url: "",
  buttons: [],
})
