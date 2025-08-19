import { z } from "zod"
import { templateVideoDefaultValue, templateVideoSchema } from "../video/schema"

export const templateCarouselVideoSchema = z.object({
  body: z.object({
    text: z.string().trim().min(1).max(1024),
    variables: z.array(z.string().min(1).max(255)),
  }),
  cards: z
    .array(templateVideoSchema)
    .min(2)
    .max(10)
    .refine(
      (cards) => {
        if (cards.length <= 1) {
          return true
        }

        const firstCardButtonCount = cards[0].buttons?.length || 0

        return cards.every(
          (card) => (card.buttons?.length || 0) === firstCardButtonCount,
        )
      },
      {
        message: "All cards must have the same number of buttons",
      },
    ),
})

export type TemplateCarouselVideoSchema = z.infer<
  typeof templateCarouselVideoSchema
>

export const templateCarouselVideoDefaultValue =
  (): TemplateCarouselVideoSchema => ({
    body: {
      text: "",
      variables: [],
    },
    cards: [templateVideoDefaultValue(1), templateVideoDefaultValue(1)],
  })
