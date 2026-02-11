import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendAudioStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendAudio),
  mode: z.enum(["file", "link"]),
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendAudioStepSchema = z.infer<typeof sendAudioStepSchema>

export const sendAudioStepDefaultFn = (
  props?: Partial<SendAudioStepSchema>,
): SendAudioStepSchema => ({
  id: createId(),
  mode: "file",
  url: "",
  buttons: [],
  ...props,
  stepType: StepType.sendAudio,
})
