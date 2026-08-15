import { flowService, importService } from "@chatbotx.io/business"
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
    throw new Error(`File exceeds ${FLOW_IMPORT_MAX_FILE_SIZE_MB}MB limit`)
  }

  // Presigned uploads cannot be trusted on size, so the stream itself is
  // still byte-capped even after a passing headObject check.
  const object = await uploader.getObjectStream(row.file.path)
  if (object.contentLength != null && object.contentLength > maxBytes) {
    throw new Error(`File exceeds ${FLOW_IMPORT_MAX_FILE_SIZE_MB}MB limit`)
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
  return JSON.parse(raw)
}

export const runFlowImport = async (row: ImportRow): Promise<void> => {
  const parsedMeta = flowImportMetaSchema.safeParse(row.meta)
  if (!parsedMeta.success) {
    await importService.fail(row.id, "Invalid flow import meta")
    return
  }
  const meta = parsedMeta.data

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
    await importService.fail(row.id, parsed.reason)
    return
  }

  const exportedFlow = parsed.data.flows[0]
  if (!exportedFlow) {
    await importService.fail(row.id, "Export contains no flows")
    return
  }

  const warnings = collectFlowReferenceWarnings(exportedFlow)

  try {
    await flowService.createFromImport({
      workspaceId: row.workspaceId,
      name: meta.flowName?.trim() || exportedFlow.name,
      active: exportedFlow.active,
      enableInInbox: exportedFlow.enableInInbox,
      startNodeId: exportedFlow.startNodeId,
      nodes: exportedFlow.nodes,
      edges: exportedFlow.edges,
      folderId: meta.targetFolderId,
    })
  } catch (error) {
    logger.error({ err: error }, `Flow import ${row.id} insert failed`)
    await importService.fail(row.id, error)
    return
  }

  const MAX_WARNING_SAMPLE = 50
  const errorSample = warnings.slice(0, MAX_WARNING_SAMPLE).map((warning) => ({
    row: 0,
    reason: `${warning.entityKind} reference at ${warning.path} (${warning.value}) was not remapped — repoint it manually.`,
  }))

  await importService.complete({
    importId: row.id,
    counters: { processed: 1, success: 1, failed: 0 },
    errorSample,
  })
}
