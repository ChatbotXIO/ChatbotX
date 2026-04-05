import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const typingStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.typing),
  seconds: z.coerce.number().min(1).max(60),
})

export type TypingStepSchema = z.infer<typeof typingStepSchema>

export const typingStepDefaultFn = (
  props?: Partial<TypingStepSchema>,
): TypingStepSchema => ({
  id: createId(),
  seconds: 2,
  ...props,
  stepType: stepTypes.enum.typing,
})
