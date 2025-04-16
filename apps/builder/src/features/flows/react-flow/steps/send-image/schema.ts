import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { buttonStepSchema } from "../button/schema"

export const sendImageStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.enum([StepType.SendImage]),
  // file: z.instanceof(File).optional(),
  url: z.string().trim().url(),
  buttons: z.array(buttonStepSchema),
})

export type SendImageStepSchema = z.infer<typeof sendImageStepSchema>

export const sendImageStepDefaultFn = (): SendImageStepSchema => ({
  id: createId(),
  stepType: StepType.SendImage,
  url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQf5GRKMzldUwuZJ7IfmvoLMru3gjphUJDGuA&s",
  buttons: [],
})
