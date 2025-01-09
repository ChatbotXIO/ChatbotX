import { createId } from "@paralleldrive/cuid2"
import { z } from 'zod';
import { cardBlockSchema, cardBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/card/schema";
import { BlockType } from "@/features/flows/react-flow/blocks/types";

export const carouselGroupBlockSchema = z.object({
  id: z.string(),
  blockType: z.enum([BlockType.Carousel]),
  cards: z.array(cardBlockSchema),
})

export type CarouselGroupBlockSchema = z.infer<typeof carouselGroupBlockSchema>

export const carouselBlockSchemaDefaultValue = (): CarouselGroupBlockSchema => ({
  id: createId(),
  blockType: BlockType.Carousel,
  cards: [
    cardBlockSchemaDefaultValue()
  ]
})
