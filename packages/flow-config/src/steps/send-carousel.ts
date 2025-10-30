import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { sendCardStepSchema } from "./send-card"
import { StepType } from "./step-action"

export const sendCarouselStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.sendCarousel),
  cards: z.array(sendCardStepSchema),
})

export type SendCarouselStepSchema = z.infer<typeof sendCarouselStepSchema>

export const sendCarouselStepDefaultFn = (): SendCarouselStepSchema => {
  // const cards: SendCardStepSchema[] = []
  // for (let i = 0; i < count; i++) {
  //   cards.push(sendCardStepDefaultFn())
  // }
  return {
    id: createId(),
    stepType: StepType.sendCarousel,
    cards: [],
  }
}
