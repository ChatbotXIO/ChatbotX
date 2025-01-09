import { createId } from "@paralleldrive/cuid2"
import { z } from 'zod';
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema";
import { BlockType } from "@/features/flows/react-flow/blocks/types";

export const cardBlockSchema = z.object({
  id: z.string(),
  blockType: z.enum([BlockType.Card]),
  title: z.string().min(1).max(200).trim(),
  subtitle: z.string().optional(),
  cardType: z.enum(['horizontal', 'square']),
  image: imageBlockSchema.optional(),
  buttons: z.array(buttonBlockSchema).optional()
})

export type CardBlockSchema = z.infer<typeof cardBlockSchema>

export const cardBlockSchemaDefaultValue = (): CardBlockSchema => ({
  id: createId(),
  blockType: BlockType.Card,
  title: '',
  cardType: 'horizontal',
  buttons: []
})
