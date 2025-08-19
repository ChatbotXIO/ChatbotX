import { z } from "zod"

export const NodeType = {
  SendMessage: "SendMessage",
  StartFlow: "StartFlow",
  Actions: "Actions",
  Condition: "Condition",
  SendMail: "SendMail",
  SplitTraffic: "SplitTraffic",
  Wait: "Wait",
  LandingPage: "LandingPage",
  AddNotes: "AddNotes",
} as const

export type NodeType = (typeof NodeType)[keyof typeof NodeType]

export type NewNodeProps = {
  id?: string
  labelVersion: number
  position: { x: number; y: number }
  measured?: { width: number; height: number }
}

export const baseNodeSchema = z.object({
  id: z.string().cuid2(),
  type: z.nativeEnum(NodeType),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  measured: z.object({
    width: z.number(),
    height: z.number(),
  }),
})
