import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const sendFoxStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendFox),
  listId: z.string().optional(),
  emailField: z.string().min(1),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type SendFoxStepSchema = z.infer<typeof sendFoxStepSchema>

export const sendFoxDefaultFn = (): SendFoxStepSchema => ({
  id: createId(),
  stepType: StepType.sendFox,
  listId: "",
  emailField: "email",
})
