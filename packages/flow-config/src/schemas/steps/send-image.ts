import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendImageStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SEND_IMAGE),
  imageMode: z.enum(["link", "file"]),
  url: z.string().trim().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendImageStepSchema = z.infer<typeof sendImageStepSchema>

export const sendImageStepDefaultFn = (): SendImageStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_IMAGE,
  imageMode: "file",
  url: "",
  buttons: [],
})
