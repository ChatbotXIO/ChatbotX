import {
  type AddNotesNodeSchema,
  addNotesNodeSchema,
} from "@/features/flows/react-flow/nodes/add-notes/schema"
import {
  type SendMessageNodeSchema,
  sendMessageNodeSchema,
} from "@/features/flows/react-flow/nodes/send-message/schema"
import {
  type SplitTrafficNodeSchema,
  splitTrafficNodeSchema,
} from "@/features/flows/react-flow/nodes/split-traffic/schema"
import {
  type StartFlowNodeSchema,
  startFlowNodeSchema,
} from "@/features/flows/react-flow/nodes/start-flow/schema"
import {
  type WaitNodeSchema,
  waitNodeSchema,
} from "@/features/flows/react-flow/nodes/wait/schema"
import { NodeType } from "@/features/flows/react-flow/types"
import { z } from "zod"

export const nodeSchema = z
  .object({
    id: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
  })
  .extend({
    type: z.enum([
      NodeType.SendMessage,
      NodeType.AddNotes,
      NodeType.SplitTraffic,
      NodeType.Wait,
      NodeType.StartFlow,
    ]),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(NodeType.SendMessage),
        data: sendMessageNodeSchema,
      }),
      z.object({
        type: z.literal(NodeType.AddNotes),
        data: addNotesNodeSchema,
      }),
      z.object({
        type: z.literal(NodeType.SplitTraffic),
        data: splitTrafficNodeSchema,
      }),
      z.object({
        type: z.literal(NodeType.Wait),
        data: waitNodeSchema,
      }),
      z.object({
        type: z.literal(NodeType.StartFlow),
        data: startFlowNodeSchema,
      }),
    ]),
  )
export type NodeSchema = z.infer<typeof nodeSchema>

export const flowVersionSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.enum([
    NodeType.SendMessage,
    NodeType.AddNotes,
    NodeType.SplitTraffic,
    NodeType.Wait,
    NodeType.StartFlow,
  ]),
  data: z.any(),
})

export type DataDefaultSchema =
  | SendMessageNodeSchema
  | AddNotesNodeSchema
  | SplitTrafficNodeSchema
  | WaitNodeSchema
  | StartFlowNodeSchema

export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
})
export type EdgeSchema = z.infer<typeof edgeSchema>
