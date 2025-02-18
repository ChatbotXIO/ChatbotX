import { addNotesNodeSchema } from "@/features/flows/react-flow/nodes/add-notes/schema"
import { sendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import { splitTrafficNodeSchema } from "@/features/flows/react-flow/nodes/split-traffic/schema"
import { NodeType } from "@/features/flows/react-flow/types"
import { z } from "zod"

export const flowVersionSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.enum([
    NodeType.SendMessage,
    NodeType.AddNotes,
    NodeType.SplitTraffic,
  ]),
  data: z.any(),
})

export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
})
export type EdgeSchema = z.infer<typeof edgeSchema>
