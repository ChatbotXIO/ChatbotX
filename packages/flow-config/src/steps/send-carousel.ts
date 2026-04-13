import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { cardLayouts } from "../types"
import { baseStepSchema } from "./base"
import { sendCardStepDefaultFn, sendCardStepSchema } from "./send-card"
import { stepTypes } from "./step-action"

export const sendCarouselStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendCarousel),
  layout: cardLayouts,
  cards: z.array(sendCardStepSchema),
})

export type SendCarouselStepSchema = z.infer<typeof sendCarouselStepSchema>

export const sendCarouselStepDefaultFn = (): SendCarouselStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendCarousel,
  layout: cardLayouts.enum.horizontal,
  cards: [sendCardStepDefaultFn()],
})
