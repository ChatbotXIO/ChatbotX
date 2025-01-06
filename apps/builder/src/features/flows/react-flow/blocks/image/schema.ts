import { z } from 'zod';
import { NodeBlockButtonSchema } from "@/features/flows/react-flow/blocks/button/schema";

export const NodeBlockImageSchema = z.object({
  id: z.string(),
  file: z.instanceof(File).optional(),
  link: z.string().url().optional(),
  base64: z.string().optional(),
  buttons: z.array(NodeBlockButtonSchema).optional(),
}).refine(data => (data.file && data.base64) || (!data.file && !data.base64), {
  message: 'File or Base64 not null',
  path: ['file', 'base64'],
}).refine(data => data.file || data.link, {
  message: 'Link not null',
  path: ['link'],
})
