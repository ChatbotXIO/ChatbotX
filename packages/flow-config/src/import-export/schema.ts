import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"
import { refineStepsByChannel } from "../channel-rules/channel-step-refinement"
import { edgeSchema, flowVersionSchema } from "../nodes/index"

export const FLOW_EXPORT_FORMAT_VERSION = 2

export const flowExportCustomFieldSchema = z.object({
  name: z.string().trim().min(1),
  type: customFieldTypes,
})
export type FlowExportCustomField = z.infer<typeof flowExportCustomFieldSchema>

export const flowExportedFlowSchema = z.object({
  name: z.string().trim().min(1).max(255),
  active: z.boolean(),
  enableInInbox: z.boolean(),
  startNodeId: z.string(),
  nodes: z.array(flowVersionSchema).superRefine(refineStepsByChannel),
  edges: z.array(edgeSchema),
})
export type FlowExportedFlow = z.infer<typeof flowExportedFlowSchema>

export const flowExportSchema = z.object({
  formatVersion: z.literal(FLOW_EXPORT_FORMAT_VERSION),
  exportedAt: z.string(),
  source: z.object({
    workspaceId: z.string(),
    flowId: z.string(),
    appVersion: z.string().optional(),
  }),
  // Export writes exactly one flow and the importer only ever reads `flows[0]`;
  // pinning the length keeps that array-of-one shape from silently accepting
  // (and dropping) a multi-flow payload.
  flows: z.array(flowExportedFlowSchema).length(1),
  // Keyed by source-workspace custom field id. A record (not an array) makes
  // duplicate-id conflicts structurally impossible to represent.
  customFields: z.record(z.string(), flowExportCustomFieldSchema).default({}),
})
export type FlowExport = z.infer<typeof flowExportSchema>

export type FlowExportParseResult =
  | { ok: true; data: FlowExport }
  | { ok: false; reason: string }

export const parseFlowExport = (raw: unknown): FlowExportParseResult => {
  const preParsed = z.object({ formatVersion: z.unknown() }).safeParse(raw)
  if (
    preParsed.success &&
    preParsed.data.formatVersion !== FLOW_EXPORT_FORMAT_VERSION
  ) {
    return {
      ok: false,
      reason: `Unsupported export format version: ${String(
        preParsed.data.formatVersion,
      )}`,
    }
  }

  const result = flowExportSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, reason: result.error.message }
  }
  return { ok: true, data: result.data }
}
