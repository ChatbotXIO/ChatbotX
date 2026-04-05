import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const NodeType = {
  sendMessage: "N01",
  startFlow: "N02",
  performAction: "N03",
  condition: "N04",
  sendMail: "N05",
  splitTraffic: "N06",
  wait: "N07",
  landingPage: "N08",
  addNotes: "N09",
} as const
export type NodeType = (typeof NodeType)[keyof typeof NodeType]

export type NewNodeProps = {
  id?: string
  labelVersion: number
  position: { x: number; y: number }
  measured?: { width: number; height: number }
}

export const baseNodeSchema = z.object({
  id: zodBigintAsString(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  measured: z.object({
    width: z.number(),
    height: z.number(),
  }),
})
export type BaseNodeSchema = z.infer<typeof baseNodeSchema>

export const baseNodeDataSchema = z.object({
  name: z.string().trim().min(1).max(255),
  isStartNode: z.boolean(),
  status: z.boolean().nullish(),
  log: z.string().nullish(),
})
export type BaseNodeDataSchema = z.infer<typeof baseNodeDataSchema>

export type DefaultNodeProps = {
  nodeProps?: Partial<Pick<BaseNodeSchema, "id" | "position" | "measured">>
  dataProps?: Partial<Pick<BaseNodeDataSchema, "isStartNode" | "name">>
  // biome-ignore lint/suspicious/noExplicitAny: safe pass beforeStep
  detailProps?: Partial<{ beforeStep: any }>
}

export const defaultNodeData = () => ({
  id: createId(),
  position: { x: 100, y: 300 },
  measured: { width: 288, height: 100 },
})
