import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const moosendStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.moosend),
  listId: z.string().optional(),
  emailField: z.string().min(1),
  nameField: z.string().optional(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type MoosendStepSchema = z.infer<typeof moosendStepSchema>

export const moosendDefaultFn = (): MoosendStepSchema => ({
  id: createId(),
  stepType: StepType.moosend,
  emailField: "email",
})
