import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const nodeTypeSchema = z.enum([
  "sendMessage",
  "startFlow",
  "performAction",
  "condition",
  "sendMail",
  "splitTraffic",
  "wait",
  "followUp",
  "landingPage",
  "addNotes",
])
export type NodeType = z.infer<typeof nodeTypeSchema>

export type NewNodeProps = {
  id?: string
  labelVersion: number
  position: { x: number; y: number }
  measured?: { width: number; height: number }
}

export const baseNodeSchema = z.object({
  id: zodBigintAsString().describe(
    "Node id (numeric string) that `edges[].source`/`target` refer to. Use a unique numeric string per node in the graph.",
  ),
  position: z
    .object({
      x: z.number().describe("Horizontal canvas position in pixels."),
      y: z.number().describe("Vertical canvas position in pixels."),
    })
    .describe("Top-left position of the node on the builder canvas."),
  measured: z
    .object({
      width: z.number().describe("Rendered node width in pixels."),
      height: z.number().describe("Rendered node height in pixels."),
    })
    .describe(
      "Rendered node size on the canvas, in pixels. Layout only; the builder default is 288x100.",
    ),
})
export type BaseNodeSchema = z.infer<typeof baseNodeSchema>

export const baseNodeDataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Node display name shown on the canvas (1-255 characters)."),
  isStartNode: z
    .boolean()
    .describe(
      "True for the node where the flow begins. Exactly one node should be the start node.",
    ),
})
export type BaseNodeDataSchema = z.infer<typeof baseNodeDataSchema>

export type DefaultNodeProps = {
  nodeProps?: Partial<Pick<BaseNodeSchema, "id" | "position" | "measured">>
  dataProps?: Partial<Pick<BaseNodeDataSchema, "isStartNode" | "name">>
  // biome-ignore lint/suspicious/noExplicitAny: safe pass beforeStep
  detailProps?: Partial<{ beforeStep: any }>
}

export const DEFAULT_NODE_MEASURED = { width: 288, height: 100 } as const

export const defaultNodeData = () => ({
  id: createId(),
  position: { x: 100, y: 300 },
  measured: DEFAULT_NODE_MEASURED,
})
