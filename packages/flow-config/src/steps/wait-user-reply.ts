import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const waitUserReplyStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.waitUserReply),
})
export type WaitUserReplyStepSchema = z.infer<typeof waitUserReplyStepSchema>

export const waitUserReplyStepDefaultFn = (): WaitUserReplyStepSchema => ({
  id: createId(),
  stepType: StepType.waitUserReply,
})
