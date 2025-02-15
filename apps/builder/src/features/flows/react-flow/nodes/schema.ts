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
import { PanelAction } from "@/features/flows/react-flow/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const nodeSchema = z
  .object({
    id: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
  })
  .extend({
    type: z.enum([
      PanelAction.SendMessage,
      PanelAction.AddNotes,
      PanelAction.SplitTraffic,
      PanelAction.Wait,
      PanelAction.StartFlow,
    ]),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(PanelAction.SendMessage),
        data: sendMessageNodeSchema,
      }),
      z.object({
        type: z.literal(PanelAction.AddNotes),
        data: addNotesNodeSchema,
      }),
      z.object({
        type: z.literal(PanelAction.SplitTraffic),
        data: splitTrafficNodeSchema,
      }),
      z.object({
        type: z.literal(PanelAction.Wait),
        data: waitNodeSchema,
      }),
      z.object({
        type: z.literal(PanelAction.StartFlow),
        data: startFlowNodeSchema,
      }),
    ]),
  )

export const draftNodeSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.enum([
    PanelAction.SendMessage,
    PanelAction.AddNotes,
    PanelAction.SplitTraffic,
    PanelAction.Wait,
    PanelAction.StartFlow,
  ]),
  data: z.any(),
})

export type NodeSchema = z.infer<typeof nodeSchema>

export type DataDefaultSchema =
  | SendMessageNodeSchema
  | AddNotesNodeSchema
  | SplitTrafficNodeSchema
  | WaitNodeSchema
  | StartFlowNodeSchema

export const nodeDefaultValue = (
  type: PanelAction,
  data: DataDefaultSchema,
): NodeSchema => {
  return {
    id: createId(),
    type,
    position: {
      x: 100,
      y: 100,
    },
    data,
  } as NodeSchema
}

export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
})

export type EdgeSchema = z.infer<typeof edgeSchema>
