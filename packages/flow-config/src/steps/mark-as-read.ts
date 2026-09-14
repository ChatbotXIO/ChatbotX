import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const markAsReadStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.markAsRead),
})

export type MarkAsReadStepSchema = z.infer<typeof markAsReadStepSchema>

export const markAsReadStepDefaultFn = (
  props?: Partial<MarkAsReadStepSchema>,
): MarkAsReadStepSchema => ({
  id: createId(),
  ...props,
  stepType: stepTypes.enum.markAsRead,
})
