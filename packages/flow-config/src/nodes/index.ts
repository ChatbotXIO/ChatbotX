import type { Node } from "@xyflow/react"
import { z } from "zod"
import { addNotesNodeSchema } from "./add-notes"
import { landingPageNodeSchema } from "./landing-page"
import { performActionNodeSchema } from "./perform-action"
import { sendMailNodeSchema } from "./send-mail"
import { sendMessageNodeSchema } from "./send-message"
import { splitTrafficNodeSchema } from "./split-traffic"
import { startFlowNodeSchema } from "./start-flow"
import { waitNodeSchema } from "./wait"

export const flowVersionSchema = z.union([
  sendMessageNodeSchema,
  startFlowNodeSchema,
  performActionNodeSchema,
  splitTrafficNodeSchema,
  waitNodeSchema,
  addNotesNodeSchema,
  landingPageNodeSchema,
  sendMailNodeSchema,
])
export type FlowVersionSchema = z.infer<typeof flowVersionSchema>

export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
})
export type EdgeSchema = z.infer<typeof edgeSchema>

export type FlowNode = Node<FlowVersionSchema["data"]>
