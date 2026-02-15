import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const typingStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.typing),
  seconds: z.coerce.number().min(1).max(60),
})

export type TypingStepSchema = z.infer<typeof typingStepSchema>

export const typingStepDefaultFn = (
  props?: Partial<TypingStepSchema>,
): TypingStepSchema => ({
  id: createId(),
  seconds: 2,
  ...props,
  stepType: StepType.typing,
})
