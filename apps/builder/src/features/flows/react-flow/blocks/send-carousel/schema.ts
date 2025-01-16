import {
  type SendCardBlockSchema,
  sendCardBlockDefaultValue,
  sendCardBlockSchema,
} from "@/features/flows/react-flow/blocks/send-card/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const sendCarouselBlockSchema = z.object({
  id: z.string(),
  actionType: z.enum([ActionType.SendCarousel]),
  cards: z.array(sendCardBlockSchema),
})

export type SendCarouselBlockSchema = z.infer<typeof sendCarouselBlockSchema>

export const sendCarouselBlockDefaultValue = (
  count = 1,
): SendCarouselBlockSchema => {
  const cards: SendCardBlockSchema[] = []
  for (let i = 0; i < count; i++) {
    cards.push(sendCardBlockDefaultValue())
  }
  return {
    id: createId(),
    actionType: ActionType.SendCarousel,
    cards,
  }
}
