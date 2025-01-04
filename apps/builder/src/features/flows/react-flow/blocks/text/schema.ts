import { z } from 'zod';
import { NodeBlockButtonSchema } from "@/features/flows/react-flow/blocks/button/schema";

export const NodeBlockTextSchema = z.object({
  id: z.string(),
  text: z.string(),
  buttons: z.array(NodeBlockButtonSchema).optional(),
});
