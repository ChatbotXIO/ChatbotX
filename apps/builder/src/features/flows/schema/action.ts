import {
  edgeSchema,
  type FlowSpec,
  flowSpecSchema,
  flowVersionSchema,
  refineStepsByChannel,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: zodBigintAsString().nullable(),
  name: z.string().trim().min(1).max(255),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>

export const updateFlowSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
  enableInInbox: z.optional(z.boolean()),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

const updateDraftFlowVersionNodesSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(edgeSchema),
})
export const updateDraftFlowVersionSchema = updateDraftFlowVersionNodesSchema
export type UpdateDraftFlowVersionSchema = z.infer<
  typeof updateDraftFlowVersionSchema
>

/** `{ spec }` input, accepted by `flows.publish`/`flows.updateDraft` alongside the raw `{ nodes, edges }` shape, and the sole input of `flows.validate`. */
export const flowSpecRequest = z.object({
  spec: flowSpecSchema satisfies z.ZodType<FlowSpec>,
})
export type FlowSpecRequest = z.infer<typeof flowSpecRequest>

/** Draft update accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored. */
export const updateDraftFlowRequest = z.union([
  updateDraftFlowVersionNodesSchema,
  flowSpecRequest,
])
export type UpdateDraftFlowRequest = z.infer<typeof updateDraftFlowRequest>

// Channel rules are declared per step (see
// `@chatbotx.io/flow-config/channel-rules`), so this stays one generic hook
// instead of accumulating a refinement per channel/step pair.
const publishFlowNodesSchema = z.object({
  nodes: z.array(flowVersionSchema).superRefine(refineStepsByChannel),
  edges: z.array(edgeSchema),
})
export const publishFlowSchema = publishFlowNodesSchema
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

/** Publish accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored — compiled server-side into the same graph shape before publishing. */
export const publishFlowRequest = z.union([
  publishFlowNodesSchema,
  flowSpecRequest,
])
export type PublishFlowRequest = z.infer<typeof publishFlowRequest>

// Reuse the package-level node union so client-side publish validation can
// never drift from the server-side `publishFlowSchema` when node types are added.
export const updateFlowVersionSchema = publishFlowSchema
export type UpdateFlowVersionSchema = z.infer<typeof updateFlowVersionSchema>

export const selectFlowSchema = z.object({
  flowId: z.string(),
})
export type SelectFlowSchema = z.infer<typeof selectFlowSchema>

export const importFlowRequest = z.object({
  fileId: zodBigintAsString(),
  folderId: zodBigintAsString().nullable(),
})
export type ImportFlowRequest = z.infer<typeof importFlowRequest>

export type ImportFlowResponse = {
  importId: string
}
