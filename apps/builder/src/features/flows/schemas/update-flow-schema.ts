import {
  draftNodeSchema,
  edgeSchema,
  nodeSchema,
} from "@/features/flows/react-flow/nodes/schema"
import { z } from "zod"

export const updateFlowSchema = z.object({
  title: z.optional(z.string().min(1).max(255).trim()),
  isPublished: z.optional(z.boolean()),
  enableInInbox: z.optional(z.boolean()),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

export const draftFlowSchema = z.object({
  nodes: z.array(draftNodeSchema),
  edges: z.array(edgeSchema),
})
export type DraftFlowSchema = z.infer<typeof draftFlowSchema>

export const publishFlowSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
})
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

export const updateFlowBindSchema: [
  chatbotId: z.ZodString,
  flowId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateFlowBindSchema = [chatbotId: string, flowId: string]
