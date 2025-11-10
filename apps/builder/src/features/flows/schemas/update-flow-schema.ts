import { edgeSchema, flowVersionSchema } from "@aha.chat/flow-config"
import { z } from "zod"

export const updateFlowSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
  enableInInbox: z.optional(z.boolean()),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

export const updateDraftFlowVersionSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(edgeSchema),
})
export type UpdateDraftFlowVersionSchema = z.infer<
  typeof updateDraftFlowVersionSchema
>

export const publishFlowSchema = z.object({
  nodes: z.array(flowVersionSchema),
  edges: z.array(edgeSchema),
})
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

export const updateFlowVersionSchema = z.object({
  nodes: z.array(flowVersionSchema),
  edges: z.array(edgeSchema),
})
export type UpdateFlowVersionSchema = z.infer<typeof updateFlowVersionSchema>
