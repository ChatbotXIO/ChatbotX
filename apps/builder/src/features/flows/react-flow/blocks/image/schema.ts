import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema";
import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';
import { BlockType } from '../types';

export const imageBlockSchema = z.object({
  id: z.string().cuid2(),
  blockType: z.enum([BlockType.Image]),
  file: z.instanceof(File).optional(),
  url: z.string().url().trim().optional(),
  base64: z.string().optional(),
  buttons: z.array(buttonBlockSchema)
}).refine(data => !!data.file || !!data.url || !!data.base64, 'File is required')

export type ImageBlockSchema = z.infer<typeof imageBlockSchema>

export const imageBlockSchemaDefaultValue = (): ImageBlockSchema => ({
  id: createId(),
  blockType: BlockType.Image,
  buttons: []
})
