import { z } from 'zod';
import { SendMessageEditorItem } from "@/features/flows/react-flow/nodes/send-message/menu";
import { NodeBlockTextSchema } from "@/features/flows/react-flow/blocks/text/schema";
import { NodeBlockImageSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { NodeBlockCardSchema } from "@/features/flows/react-flow/blocks/card/schema";

export const NodeBlockSchema = z.object({
  id: z.union([z.string(), z.number()]),
  key: z.enum(Object.values(SendMessageEditorItem) as [string, ...string[]]),
  text: z.array(NodeBlockTextSchema).optional(),
  images: z.array(NodeBlockImageSchema).optional(),
  cards: z.array(NodeBlockCardSchema).optional(),
  videos: z.array(z.unknown()).optional(),
  carousel: z.array(z.unknown()).optional(),
})

export const NodeDataSchema = z.object({
  id: z.string(),
  blocks: z.array(NodeBlockSchema).optional(),
})

export type NodeBlockPayload = z.infer<typeof NodeBlockSchema>
