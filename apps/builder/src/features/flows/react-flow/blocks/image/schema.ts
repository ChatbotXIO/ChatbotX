import { z } from 'zod';
import { NodeBlockButtonSchema } from "@/features/flows/react-flow/blocks/button/schema";

export const NodeBlockImageSchema = z.object({
  id: z.string(),
  file: z.instanceof(File).optional(),
  link: z.string().url().optional(),
  base64: z.string().optional(),
  buttons: z.array(NodeBlockButtonSchema).optional(),
})
