import {
  botFieldService,
  customFieldService,
  flowService,
  importService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { flowImportMetaSchema } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import {
  collectFlowReferenceWarnings,
  type FlowAuthoringError,
  FlowAuthoringException,
  type FlowReferenceWarning,
  parseFlowExport,
} from "@chatbotx.io/flow-config"
import { getImportEntry } from "@chatbotx.io/imports/registry"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
import { logger } from "../../../lib/logger"
import type { ImportRow } from "./base-import"

const BYTES_PER_MB = 1024 * 1024
// Sourced from the registry rather than redeclared, so the limit the dropzone
// advertises to the user and the one the worker enforces cannot drift apart.
const FLOW_IMPORT_MAX_FILE_SIZE_MB = getImportEntry("flow").config.maxFileSizeMB

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

const summarizeSchemaError = (
  errors: readonly FlowAuthoringError[],
): string => {
  const [first] = errors
  if (!first) {
    return "The export file does not match the expected format."
  }

  const path = first.path ? ` at ${first.path}` : ""
  return `Invalid export file${path}: ${first.message}`
}

const toImportErrorSamples = (errors: readonly FlowAuthoringError[]) =>
  errors.map((error) => ({
    reason: error.message,
    path: error.path,
    code: error.code,
    capability: error.capability,
  }))

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
        summarizeSchemaError(parsed.errors),
        "flowImportSchemaMismatch",
      ),
      { processed: 1, success: 0, failed: 1 },
      toImportErrorSamples(parsed.errors),
    )
    return
  }

  const exportedFlow = parsed.data.flows[0]

  let createdCustomFieldIds: string[]
  let createdBotFieldIds: string[]
  let warnings: FlowReferenceWarning[]
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
      botFields: parsed.data.botFields,
      folderId: parsedMeta.data.folderId,
    })
    createdCustomFieldIds = result.createdCustomFieldIds
    createdBotFieldIds = result.createdBotFieldIds
    // Custom-field (and bot-field) creation is unconditional, so any
    // reference whose source id has a manifest entry is guaranteed resolved
    // — warn on the *source* graph (ids still recognizable against the
    // manifest), then drop exactly those warnings. Other kinds (sequence,
    // aiAgent, integration, …) are untouched by either manifest and warn
    // exactly as before; an unmapped customField/botField id (no manifest
    // entry) still warns.
    const customFieldManifestIds = new Set(
      Object.keys(parsed.data.customFields),
    )
    const botFieldManifestIds = new Set(Object.keys(parsed.data.botFields))
    warnings = collectFlowReferenceWarnings(exportedFlow).filter(
      (warning) =>
        !(
          (warning.entityKind === "customField" &&
            customFieldManifestIds.has(warning.value)) ||
          (warning.entityKind === "botField" &&
            botFieldManifestIds.has(warning.value))
        ),
    )
  } catch (error) {
    logger.error({ err: error }, `Flow import ${row.id} insert failed`)
    if (error instanceof FlowAuthoringException) {
      await importService.fail(
        row.id,
        error,
        { processed: 1, success: 0, failed: 1 },
        toImportErrorSamples(error.errors),
      )
      return
    }
    await importService.fail(row.id, error)
    return
  }

  if (createdCustomFieldIds.length > 0) {
    await customFieldService.invalidate({ workspaceId: row.workspaceId })
  }
  if (createdBotFieldIds.length > 0) {
    await botFieldService.invalidate({ workspaceId: row.workspaceId })
  }

  const MAX_WARNING_SAMPLE = 50
  const errorSample = warnings.slice(0, MAX_WARNING_SAMPLE).map((warning) => ({
    path: warning.path,
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
