import {
  edgeSchema,
  flowVersionSchema,
} from "@/features/flows/react-flow/nodes/schema"
import { z } from "zod"

export const updateFlowSchema = z.object({
  name: z.optional(z.string().min(1).max(255).trim()),
  active: z.optional(z.boolean()),
  enableInInbox: z.optional(z.boolean()),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

export const updateDraftFlowVersionSchema = z.object({
  nodes: z.array(flowVersionSchema),
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
