import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { buttonStepSchema } from "../button/schema"

export const sendImageStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SendImage),
  imageMode: z.enum(["link", "file"]),
  // file: z.instanceof(File).optional(),
  url: z.string().trim().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendImageStepSchema = z.infer<typeof sendImageStepSchema>

export const sendImageStepDefaultFn = (): SendImageStepSchema => ({
  id: createId(),
  stepType: StepType.SendImage,
  imageMode: "file",
  url: "",
  buttons: [],
})
