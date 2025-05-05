import {
  type SendCardStepSchema,
  sendCardStepDefaultFn,
  sendCardStepSchema,
} from "@/features/flows/react-flow/steps/send-card/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"

export const sendCarouselStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.SendCarousel),
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
    stepType: StepType.SendCarousel,
    cards,
  }
}
