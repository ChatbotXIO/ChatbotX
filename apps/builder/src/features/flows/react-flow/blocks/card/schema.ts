import { z } from 'zod';
// import { NodeBlockImageSchema } from "@/features/flows/react-flow/blocks/image/schema";
// import { NodeBlockButtonSchema } from "@/features/flows/react-flow/blocks/button/schema";

export const NodeBlockCardSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageType: z.enum(['horizontal', 'square']),
  // image: NodeBlockImageSchema.optional(),
  // buttons: z.array(NodeBlockButtonSchema).optional(),
})

export type NodeBlockCardSchema = z.infer<typeof NodeBlockCardSchema>
