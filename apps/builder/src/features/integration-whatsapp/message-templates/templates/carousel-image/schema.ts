import { z } from "zod"
import { templateImageDefaultValue, templateImageSchema } from "../image/schema"

export const templateCarouselImageSchema = z.object({
  body: z.object({
    text: z.string().trim().min(1).max(1024),
    variables: z.array(z.string().min(1).max(255)),
  }),
  cards: z
    .array(templateImageSchema)
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

export type TemplateCarouselImageSchema = z.infer<
  typeof templateCarouselImageSchema
>

export const templateCarouselImageDefaultValue =
  (): TemplateCarouselImageSchema => ({
    body: {
      text: "",
      variables: [],
    },
    cards: [templateImageDefaultValue(1), templateImageDefaultValue(1)],
  })
