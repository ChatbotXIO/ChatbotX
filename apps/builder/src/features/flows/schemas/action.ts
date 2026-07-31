import { edgeSchema, flowVersionSchema } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { refineStepsByChannel } from "./channel-step-refinement"

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

export const updateDraftFlowVersionSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(edgeSchema),
})
export type UpdateDraftFlowVersionSchema = z.infer<
  typeof updateDraftFlowVersionSchema
>

// Channel rules are declared per step (see `react-flow/steps/validators.ts`),
// so this stays one generic hook instead of accumulating a refinement per
// channel/step pair.
export const publishFlowSchema = z.object({
  nodes: z.array(flowVersionSchema).superRefine(refineStepsByChannel),
  edges: z.array(edgeSchema),
})
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

// Reuse the package-level node union so client-side publish validation can
// never drift from the server-side `publishFlowSchema` when node types are added.
export const updateFlowVersionSchema = publishFlowSchema
export type UpdateFlowVersionSchema = z.infer<typeof updateFlowVersionSchema>

export const selectFlowSchema = z.object({
  flowId: z.string(),
})
export type SelectFlowSchema = z.infer<typeof selectFlowSchema>
