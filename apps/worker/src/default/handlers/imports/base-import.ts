import { db, eq } from "@chatbotx.io/database/client"
import type { ImportFormat, ImportType } from "@chatbotx.io/database/partials"
import { type fileModel, importModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { getImportEntry } from "@chatbotx.io/imports"
import { createImportRowParser } from "@chatbotx.io/imports/parsers"
import { logger } from "../../../lib/logger"

const BYTES_PER_MB = 1024 * 1024
const COUNTER_FLUSH_EVERY = 100

export type ImportRow = typeof importModel.$inferSelect & {
  file: typeof fileModel.$inferSelect
  format: ImportFormat
}

type Counters = {
  processed: number
  success: number
  failed: number
}

export type ImportPrepareResult<TDeps> =
  | { ok: true; deps: TDeps }
  | { ok: false; reason: string }

export type ImportTypeHandler<TMeta, TDeps, TRow> = {
  type: ImportType
  parseMeta: (raw: unknown) => TMeta
  prepare: (ctx: {
    row: ImportRow
    meta: TMeta
  }) => Promise<ImportPrepareResult<TDeps>>
  extractRow: (rawRow: Record<string, unknown>, meta: TMeta) => TRow | null
  processRow: (
    deps: TDeps,
    mapped: TRow,
    ctx: { row: ImportRow; meta: TMeta },
  ) => Promise<boolean>
}

export const runImportPipeline = async <TMeta, TDeps, TRow>(
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

  await db
    .update(importModel)
    .set({ status: "processing" })
    .where(eq(importModel.id, row.id))

  const prepared = await handler.prepare({ row, meta })
  if (!prepared.ok) {
    await failImport(row.id, prepared.reason)
    return
  }

  const config = getImportEntry(handler.type).config
  const maxRows = config.maxRows
  const maxBytes = config.maxFileSizeMB * BYTES_PER_MB

  const counters: Counters = { processed: 0, success: 0, failed: 0 }
  let parser: AsyncIterable<Record<string, unknown>>
  try {
    const { stream, contentLength } = await uploader.getObjectStream(
      row.file.path,
    )
    console.log({
      contentLength,
      maxBytes,
    })
    if ((contentLength ?? 0) > maxBytes) {
      stream.destroy()
      await failImport(row.id, `File exceeds ${config.maxFileSizeMB}MB limit`)
      return
    }
    parser = createImportRowParser(row.format, stream)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parser error"
    logger.error(error, `Import ${row.id} parser init failed`)
    await failImport(row.id, message)
    return
  }

  let lastFlushAt = 0
  try {
    for await (const rawRow of parser) {
      if (counters.processed >= maxRows) {
        throw new Error(`Row limit exceeded (${maxRows})`)
      }
      counters.processed += 1
      const mapped = handler.extractRow(rawRow, meta)
      if (mapped) {
        const ok = await handler.processRow(prepared.deps, mapped, {
          row,
          meta,
        })
        if (ok) {
          counters.success += 1
        } else {
          counters.failed += 1
        }
      } else {
        counters.failed += 1
      }

      if (counters.processed - lastFlushAt >= COUNTER_FLUSH_EVERY) {
        lastFlushAt = counters.processed
        await flushCounters(row.id, counters).catch((error) =>
          logger.error(error, "Counter flush failed"),
        )
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error(error, `Import ${row.id} stream error`)
    await db
      .update(importModel)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
        totalCount: counters.processed,
        processedCount: counters.processed,
        successCount: counters.success,
        failedCount: counters.failed,
      })
      .where(eq(importModel.id, row.id))
    return
  }

  await db
    .update(importModel)
    .set({
      status: "completed",
      completedAt: new Date(),
      totalCount: counters.processed,
      processedCount: counters.processed,
      successCount: counters.success,
      failedCount: counters.failed,
    })
    .where(eq(importModel.id, row.id))
}

const failImport = async (importId: string, message: string): Promise<void> => {
  await db
    .update(importModel)
    .set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    })
    .where(eq(importModel.id, importId))
}

const flushCounters = async (
  importId: string,
  counters: Counters,
): Promise<void> => {
  await db
    .update(importModel)
    .set({
      processedCount: counters.processed,
      successCount: counters.success,
      failedCount: counters.failed,
    })
    .where(eq(importModel.id, importId))
}
