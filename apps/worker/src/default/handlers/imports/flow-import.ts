import {
  customFieldService,
  flowService,
  importService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { flowImportMetaSchema } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import {
  collectFlowReferenceWarnings,
  parseFlowExport,
} from "@chatbotx.io/flow-config"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
import { logger } from "../../../lib/logger"
import type { ImportRow } from "./base-import"

const BYTES_PER_MB = 1024 * 1024
const FLOW_IMPORT_MAX_FILE_SIZE_MB = 5

const readImportedJson = async (row: ImportRow): Promise<unknown> => {
  const maxBytes = FLOW_IMPORT_MAX_FILE_SIZE_MB * BYTES_PER_MB

  let headSize: number | null = null
  try {
    const head = await uploader.headObject(row.file.path)
    headSize = head.ContentLength ?? null
  } catch (error) {
    logger.warn(
      { err: error },
      `Flow import ${row.id} headObject failed, falling back to stream`,
    )
  }
  if (headSize != null && headSize > maxBytes) {
    throw new ChatbotXException(
      `File exceeds ${FLOW_IMPORT_MAX_FILE_SIZE_MB}MB limit`,
      "flowImportFileTooLarge",
    )
  }

  // Presigned uploads cannot be trusted on size, so the stream itself is
  // still byte-capped even after a passing headObject check.
  const object = await uploader.getObjectStream(row.file.path)
  if (object.contentLength != null && object.contentLength > maxBytes) {
    throw new ChatbotXException(
      `File exceeds ${FLOW_IMPORT_MAX_FILE_SIZE_MB}MB limit`,
      "flowImportFileTooLarge",
    )
  }
  const guardedStream = createByteLimitedStream(object.stream, {
    maxBytes,
    errorMessage: `File exceeds ${FLOW_IMPORT_MAX_FILE_SIZE_MB}MB limit`,
  })

  const chunks: Buffer[] = []
  for await (const chunk of guardedStream) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString("utf8")

  try {
    return JSON.parse(raw)
  } catch {
    throw new ChatbotXException(
      "The file is not valid JSON.",
      "flowImportInvalidJson",
    )
  }
}

/**
 * `parseFlowExport`'s `reason` is either a plain sentence (the format-version
 * pre-check) or Zod's default `error.message`, a multi-issue JSON dump. Only
 * the latter needs summarizing — this keeps the first issue's path and
 * message, which is the part a user can act on.
 */
const summarizeSchemaError = (message: string): string => {
  let issues: Array<{ path?: unknown[]; message?: string }>
  try {
    issues = JSON.parse(message)
  } catch {
    return message
  }
  const [first] = issues
  if (!first?.message) {
    return "The export file does not match the expected format."
  }
  const path = first.path?.length ? ` at ${first.path.join(".")}` : ""
  return `Invalid export file${path}: ${first.message}`
}

export const runFlowImport = async (row: ImportRow): Promise<void> => {
  const parsedMeta = flowImportMetaSchema.safeParse(row.meta)
  if (!parsedMeta.success) {
    await importService.fail(
      row.id,
      new ChatbotXException(
        "Invalid flow import meta",
        "flowImportInvalidMeta",
      ),
    )
    return
  }

  await importService.markProcessing(row.id)

  let json: unknown
  try {
    json = await readImportedJson(row)
  } catch (error) {
    logger.error({ err: error }, `Flow import ${row.id} read failed`)
    await importService.fail(row.id, error)
    return
  }

  const parsed = parseFlowExport(json)
  if (!parsed.ok) {
    await importService.fail(
      row.id,
      new ChatbotXException(
        summarizeSchemaError(parsed.reason),
        "flowImportSchemaMismatch",
      ),
    )
    return
  }

  const exportedFlow = parsed.data.flows[0]

  let createdCustomFieldIds: string[]
  let warnings: ReturnType<typeof collectFlowReferenceWarnings>
  try {
    const result = await flowService.importFlowExport({
      workspaceId: row.workspaceId,
      name: exportedFlow.name,
      active: exportedFlow.active,
      enableInInbox: exportedFlow.enableInInbox,
      startNodeId: exportedFlow.startNodeId,
      nodes: exportedFlow.nodes,
      edges: exportedFlow.edges,
      customFields: parsed.data.customFields,
    })
    createdCustomFieldIds = result.createdCustomFieldIds
    // Custom-field creation is unconditional, so any customField reference
    // whose source id has a manifest entry is guaranteed resolved — warn on
    // the *source* graph (ids still recognizable against the manifest), then
    // drop exactly those warnings. Other kinds (sequence, aiAgent,
    // integration, …) are untouched by the manifest and warn exactly as
    // before; an unmapped customField id (no manifest entry) still warns.
    const manifestIds = new Set(Object.keys(parsed.data.customFields))
    warnings = collectFlowReferenceWarnings(exportedFlow).filter(
      (warning) =>
        !(
          warning.entityKind === "customField" && manifestIds.has(warning.value)
        ),
    )
  } catch (error) {
    logger.error({ err: error }, `Flow import ${row.id} insert failed`)
    await importService.fail(row.id, error)
    return
  }

  if (createdCustomFieldIds.length > 0) {
    await customFieldService.invalidate({ workspaceId: row.workspaceId })
  }

  const MAX_WARNING_SAMPLE = 50
  // `errorSample.row` is typed as a data-row number; a reference warning has
  // no row of its own, so a 1-based warning index is used instead of a fixed
  // `0` — the UI shows "Row N" per entry, and a fixed `0` for every entry
  // would look like a single dangling row.
  const errorSample = warnings
    .slice(0, MAX_WARNING_SAMPLE)
    .map((warning, index) => ({
      row: index + 1,
      reason: `${warning.entityKind} reference at ${warning.path} (${warning.value}) was not remapped — repoint it manually.`,
    }))

  await importService.complete({
    importId: row.id,
    counters: { processed: 1, success: 1, failed: 0 },
    errorSample,
    warningMessage:
      warnings.length > 0
        ? `Imported with ${warnings.length} unresolved reference${warnings.length === 1 ? "" : "s"} — review and repoint them.`
        : undefined,
  })
}
