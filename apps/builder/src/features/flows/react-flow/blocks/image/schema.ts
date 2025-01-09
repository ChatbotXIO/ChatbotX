import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema";
import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';
import { BlockType } from '../types';

export const imageBlockSchema = z.object({
  id: z.string().cuid2(),
  blockType: z.enum([BlockType.Image]),
  file: z.instanceof(File).optional(),
  url: z.string().url().trim().optional(),
  buttons: z.array(buttonBlockSchema)
})

export type ImageBlockSchema = z.infer<typeof imageBlockSchema>

export const imageBlockSchemaDefaultValue = (): ImageBlockSchema => ({
  id: createId(),
  blockType: BlockType.Image,
  url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQf5GRKMzldUwuZJ7IfmvoLMru3gjphUJDGuA&s",
  buttons: []
})
