import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { cardLayouts } from "../types"
import { sendCardStepDefaultFn, sendCardStepSchema } from "./send-card"
import { StepType } from "./step-action"

export const sendCarouselStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.sendCarousel),
  layout: cardLayouts,
  cards: z.array(sendCardStepSchema),
})

export type SendCarouselStepSchema = z.infer<typeof sendCarouselStepSchema>

export const sendCarouselStepDefaultFn = (): SendCarouselStepSchema => ({
  id: createId(),
  stepType: StepType.sendCarousel,
  layout: cardLayouts.enum.horizontal,
  cards: [sendCardStepDefaultFn()],
})
