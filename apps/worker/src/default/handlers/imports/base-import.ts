import { importService } from "@chatbotx.io/business"
import type { ImportFormat, ImportType } from "@chatbotx.io/database/partials"
import type { fileModel, importModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { getImportEntry } from "@chatbotx.io/imports"
import { createImportRowParser } from "@chatbotx.io/imports/parsers"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
import { logger } from "../../../lib/logger"

const BYTES_PER_MB = 1024 * 1024
// L-5: Flushing every 100 rows at concurrency=5 creates noticeable write
// churn on the Import table. 500 gives real-time-ish progress with far
// fewer round-trips.
const COUNTER_FLUSH_EVERY = 500
const IMPORT_BATCH_SIZE = 1000

export type ImportRow = typeof importModel.$inferSelect & {
  file: typeof fileModel.$inferSelect
  format: ImportFormat
}

type Counters = {
  processed: number
  success: number
  failed: number
}

export type BatchResult = {
  success: number
  failed: number
  errors?: Array<{ row: number; reason: string }>
}

export type ImportPrepareResult<TDeps> =
  | { ok: true; deps: TDeps }
  | { ok: false; reason: string }

export type ImportTypeHandler<TMeta, TDeps, TRow extends object> = {
  type: ImportType
  parseMeta: (raw: unknown) => TMeta
  prepare: (ctx: {
    row: ImportRow
    meta: TMeta
  }) => Promise<ImportPrepareResult<TDeps>>
  // Per-record CPU transform. No DB access — runs once per parsed row.
  processRow: (
    deps: TDeps,
    rawRow: Record<string, unknown>,
    meta: TMeta,
    context: { rowNumber: number },
  ) => TRow | null | { error: string }
  // Bulk DB write for a chunk of up to IMPORT_BATCH_SIZE transformed rows.
  processBatch: (
    deps: TDeps,
    rows: TRow[],
    ctx: { row: ImportRow; meta: TMeta },
  ) => Promise<BatchResult>
}

export const runImportPipeline = async <TMeta, TDeps, TRow extends object>(
  row: ImportRow,
  handler: ImportTypeHandler<TMeta, TDeps, TRow>,
): Promise<void> => {
  let meta: TMeta
  try {
    meta = handler.parseMeta(row.meta)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid meta"
    await failImport(row.id, message)
    return
  }

  const config = getImportEntry(handler.type).config
  if (!config.acceptedFormats.includes(row.format)) {
    await failImport(
      row.id,
      `${row.format} is not supported for ${handler.type} imports`,
    )
    return
  }

  await importService.markProcessing(row.id)

  const prepared = await handler.prepare({ row, meta })
  if (!prepared.ok) {
    await failImport(row.id, prepared.reason)
    return
  }

  const maxRows = config.maxRows
  const maxBytes = config.maxFileSizeMB * BYTES_PER_MB

  const counters: Counters = { processed: 0, success: 0, failed: 0 }
  const errorSample: Array<{ row: number; reason: string }> = []
  const captureErrors = (
    errors: Array<{ row: number; reason: string }>,
  ): void => {
    const remaining = 50 - errorSample.length
    if (remaining > 0) {
      errorSample.push(...errors.slice(0, remaining))
    }
  }
  let parser: AsyncIterable<Record<string, unknown>>
  try {
    const { stream } = await loadImportObject({
      importId: row.id,
      path: row.file.path,
      maxBytes,
    })
    parser = createImportRowParser(row.format, stream)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parser error"
    // H-5: `err` key required for pino stack-trace serialization.
    logger.error({ err: error }, `Import ${row.id} parser init failed`)
    await failImport(row.id, message)
    return
  }

  let buffer: TRow[] = []
  const flushBatch = async (): Promise<void> => {
    if (buffer.length === 0) {
      return
    }
    const batch = buffer
    buffer = []
    const result = await handler.processBatch(prepared.deps, batch, {
      row,
      meta,
    })
    counters.success += result.success
    counters.failed += result.failed
    captureErrors(result.errors ?? [])
  }

  let lastFlushAt = 0
  try {
    for await (const rawRow of parser) {
      if (counters.processed >= maxRows) {
        throw new Error(`Row limit exceeded (${maxRows})`)
      }
      counters.processed += 1

      const mapped = handler.processRow(prepared.deps, rawRow, meta, {
        rowNumber: counters.processed + 1,
      })
      if (mapped && !("error" in mapped)) {
        buffer.push(mapped)
        if (buffer.length >= IMPORT_BATCH_SIZE) {
          await flushBatch()
        }
      } else {
        counters.failed += 1
        captureErrors([
          {
            row: counters.processed + 1,
            reason: mapped && "error" in mapped ? mapped.error : "Invalid row",
          },
        ])
      }

      if (counters.processed - lastFlushAt >= COUNTER_FLUSH_EVERY) {
        lastFlushAt = counters.processed
        await importService
          .flushProgress({
            importId: row.id,
            counters,
            errorSample,
          })
          .catch((error) =>
            logger.error({ err: error }, "Counter flush failed"),
          )
      }
    }
    await flushBatch()
  } catch (error) {
    logger.error({ err: error }, `Import ${row.id} stream error`)
    await importService.fail(row.id, error, counters, errorSample)
    return
  }

  await importService.complete({
    importId: row.id,
    counters,
    errorSample,
  })
}

const failImport = async (importId: string, message: string): Promise<void> => {
  await importService.fail(importId, message)
}

const loadImportObject = async (input: {
  importId: string
  path: string
  maxBytes: number
}): Promise<{ stream: import("node:stream").Readable }> => {
  let headSize: number | null = null
  try {
    const head = await uploader.headObject(input.path)
    headSize = head.ContentLength ?? null
  } catch (error) {
    logger.warn(
      { err: error },
      `Import ${input.importId} headObject failed, falling back to stream`,
    )
  }

  if (headSize != null && headSize > input.maxBytes) {
    throw new Error(`File exceeds ${input.maxBytes / BYTES_PER_MB}MB limit`)
  }

  const object = await uploader.getObjectStream(input.path)
  const objectSize = object.contentLength ?? null
  if (objectSize != null && objectSize > input.maxBytes) {
    throw new Error(`File exceeds ${input.maxBytes / BYTES_PER_MB}MB limit`)
  }

  return {
    stream: createByteLimitedStream(object.stream, {
      maxBytes: input.maxBytes,
      errorMessage: `File exceeds ${input.maxBytes / BYTES_PER_MB}MB limit`,
    }),
  }
}
