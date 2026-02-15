import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { CardLayout } from "../types"
import { sendCardStepDefaultFn, sendCardStepSchema } from "./send-card"
import { StepType } from "./step-action"

export const sendCarouselStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.sendCarousel),
  layout: z.enum(CardLayout),
  cards: z.array(sendCardStepSchema),
})

export type SendCarouselStepSchema = z.infer<typeof sendCarouselStepSchema>

export const sendCarouselStepDefaultFn = (): SendCarouselStepSchema => ({
  id: createId(),
  stepType: StepType.sendCarousel,
  layout: CardLayout.horizontal,
  cards: [sendCardStepDefaultFn()],
})
