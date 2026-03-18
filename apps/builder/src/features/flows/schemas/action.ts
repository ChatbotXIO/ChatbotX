import {
  addNotesNodeSchema,
  edgeSchema,
  flowVersionSchema,
  sendMessageNodeSchema,
} from "@aha.chat/flow-config"
import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: z.string().nullable(),
  name: z.string().trim().min(1).max(255),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>

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
  nodes: z.array(
    z.discriminatedUnion("type", [sendMessageNodeSchema, addNotesNodeSchema]),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      sourceHandle: z.string(),
      target: z.string(),
      targetHandle: z.string(),
    }),
  ),
})
export type UpdateFlowVersionSchema = z.infer<typeof updateFlowVersionSchema>

export const selectFlowSchema = z.object({
  flowId: z.string(),
})
export type SelectFlowSchema = z.infer<typeof selectFlowSchema>
