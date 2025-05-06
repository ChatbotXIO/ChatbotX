import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"

export const sendMessageNodeStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.SendMessageNode),
  nodeId: z.string().cuid2(),
})

export type SendMessageNodeStepSchema = z.infer<
  typeof sendMessageNodeStepSchema
>

export const sendMessageNodeStepDefaultFn = (): SendMessageNodeStepSchema => ({
  id: createId(),
  stepType: StepType.SendMessageNode,
  nodeId: "",
})
