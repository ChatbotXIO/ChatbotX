import { z } from 'zod';
import { buttonBlockSchema } from './button/schema';
import { textBlockSchema } from './text/schema';
import { BlockType } from './types';

export enum CardLayout {
  Vertical = "Vertical",
  Horizontal = "Horizontal",
}

export const cardBlockSchema = z.object({
  id: z.string().cuid2(),
  blockType: z.enum([BlockType.Card]),
  image: z.string(),
  title: z.string().max(100),
  subtitle: z.string().max(255).nullable(),
  cardUrl: z.string().max(255).nullable(),
  buttons: z.array(buttonBlockSchema),
})
export type CardBlockSchema = z.infer<typeof cardBlockSchema>

export const carouselBlockSchema = z.object({
  id: z.string().cuid2(),
  blockType: z.enum([BlockType.Carousel]),
  cardlayout: z.nativeEnum(CardLayout),
  cards: z.array(cardBlockSchema),
})
export type CarouselBlockSchema = z.infer<typeof carouselBlockSchema>

