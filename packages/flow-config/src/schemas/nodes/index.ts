import type { Node } from "@xyflow/react"
import { z } from "zod"
import { addNotesNodeSchema } from "./add-notes"
import { NodeType } from "./node-config"
import {
  type SendMessageNodeSchema,
  sendMessageNodeSchema,
} from "./send-message"
import { splitTrafficNodeSchema } from "./split-traffic"
import { startFlowNodeSchema } from "./start-flow"
import { waitNodeSchema } from "./wait"

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

export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
})
export type EdgeSchema = z.infer<typeof edgeSchema>

export type NodeData = SendMessageNodeSchema["data"]
// | AddNotesNodeSchema["data"]

// export type StepData =
//   | SendMessageNodeSchema["data"]["blocks"][number]
//   | StartFlowNodeSchema["data"]["blocks"][number]
//   | WaitNodeSchema["data"]["blocks"][number]

export type FlowNode = Node<NodeData>

export * from "./add-notes"
export * from "./node-config"
export * from "./send-message"
export * from "./split-traffic"
export * from "./split-traffic"
export * from "./start-flow"
export * from "./wait"
