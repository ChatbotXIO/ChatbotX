import {
  edgeSchema,
  flowSpecSchema,
  flowVersionSchema,
  refineStepsByChannel,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: zodBigintAsString()
    .nullable()
    .describe(
      "Folder id (numeric string) to create the flow in, or null for no folder.",
    ),
  name: z.string().trim().min(1).max(255).describe("Flow name."),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>

export const updateFlowSchema = z.object({
  name: z
    .optional(z.string().trim().min(1).max(255))
    .describe("New flow name."),
  active: z.optional(z.boolean()).describe("Whether the flow is active."),
  enableInInbox: z
    .optional(z.boolean())
    .describe("Whether agents can start this flow manually from the inbox."),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

export const updateDraftFlowVersionSchema = z.object({
  nodes: z
    .array(z.any())
    .describe("Raw flow node graph, as sent by the builder UI."),
  edges: z
    .array(edgeSchema)
    .describe("Raw flow edge graph, as sent by the builder UI."),
})
export type UpdateDraftFlowVersionSchema = z.infer<
  typeof updateDraftFlowVersionSchema
>

/** `{ spec }` input, accepted by `flows.publish`/`flows.updateDraft` alongside the raw `{ nodes, edges }` shape, and the sole input of `flows.validate`. */
export const flowSpecRequest = z.object({
  spec: flowSpecSchema,
})

/** Draft update accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored. */
export const updateDraftFlowRequest = z.union([
  updateDraftFlowVersionSchema,
  flowSpecRequest,
])

// Channel rules are declared per step (see
// `@chatbotx.io/flow-config/channel-rules`), so this stays one generic hook
// instead of accumulating a refinement per channel/step pair.
export const publishFlowSchema = z.object({
  nodes: z
    .array(flowVersionSchema)
    .superRefine(refineStepsByChannel)
    .describe("Raw flow node graph, as sent by the builder UI."),
  edges: z
    .array(edgeSchema)
    .describe("Raw flow edge graph, as sent by the builder UI."),
})
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

/** Publish accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored — compiled server-side into the same graph shape before publishing. */
export const publishFlowRequest = z.union([publishFlowSchema, flowSpecRequest])

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
