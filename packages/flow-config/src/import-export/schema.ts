import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"
import { refineStepsByChannel } from "../channel-rules/channel-step-refinement"
import { zodFieldName } from "../field-reference"
import { edgeSchema, flowVersionSchema } from "../nodes/index"

export const FLOW_EXPORT_FORMAT_VERSION = 2

// Intentionally NOT `zodFieldName()`: `CustomField` predates the reserved
// `bot_field:` prefix guard added by Account Fields, so a legacy workspace
// can already contain a custom field whose name happens to start with that
// prefix. Rejecting the manifest entry here would turn an unrelated data-
// hygiene issue into a hard import failure for an otherwise-valid export.
// The rollout audit (scripts/audit-bot-field-reserved-names.mts) is how that
// pre-existing risk gets surfaced and cleaned up instead.
export const flowExportCustomFieldSchema = z.object({
  name: z.string().trim().min(1),
  type: customFieldTypes,
})
export type FlowExportCustomField = z.infer<typeof flowExportCustomFieldSchema>

// Mirrors `flowExportCustomFieldSchema` except for `name`: `BotField` is a
// new table introduced alongside the reserved-prefix guard, so every row was
// created under `zodFieldName()` from day one — no legacy data can violate
// it, so the manifest can safely reject it too (defense in depth against a
// hand-crafted or corrupted export file).
export const flowExportBotFieldSchema = z.object({
  name: zodFieldName(),
  type: customFieldTypes,
})
export type FlowExportBotField = z.infer<typeof flowExportBotFieldSchema>

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
  // Keyed by source-workspace bot field id, same shape/semantics as
  // `customFields`. `.default({})` so an export produced before this key
  // existed still parses — no format-version bump, mirroring how
  // `customFields` itself has always defaulted.
  botFields: z.record(z.string(), flowExportBotFieldSchema).default({}),
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
