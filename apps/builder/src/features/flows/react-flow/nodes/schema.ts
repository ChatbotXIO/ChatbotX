import { addNotesNodeSchema } from "@/features/flows/react-flow/nodes/add-notes/schema"
import { sendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import { splitTrafficNodeSchema } from "@/features/flows/react-flow/nodes/split-traffic/schema"
import { PanelAction } from "@/features/flows/react-flow/types"
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
    ]),
  )
export type NodeSchema = z.infer<typeof nodeSchema>

export const flowVersionSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.enum([
    PanelAction.SendMessage,
    PanelAction.AddNotes,
    PanelAction.SplitTraffic,
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
