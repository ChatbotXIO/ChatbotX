import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  type SendCardStepSchema,
  sendCardStepDefaultFn,
  sendCardStepSchema,
} from "./send-card"
import { StepType } from "./step-action"

export const sendCarouselStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.SEND_CAROUSEL),
  cards: z.array(sendCardStepSchema),
})

export type SendCarouselStepSchema = z.infer<typeof sendCarouselStepSchema>

export const sendCarouselStepDefaultFn = (
  count = 1,
): SendCarouselStepSchema => {
  const cards: SendCardStepSchema[] = []
  for (let i = 0; i < count; i++) {
    cards.push(sendCardStepDefaultFn())
  }
  return {
    id: createId(),
    stepType: StepType.SEND_CAROUSEL,
    cards,
  }
}
