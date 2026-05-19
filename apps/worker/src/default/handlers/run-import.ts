import { db, eq } from "@chatbotx.io/database/client"
import { importFormats, importTypes } from "@chatbotx.io/database/partials"
import { importModel } from "@chatbotx.io/database/schema"
import type { JobRunImport } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { type ImportRow, importHandlers, runImportPipeline } from "./imports"

export const runImport = async (data: JobRunImport["data"]): Promise<void> => {
  const row = await db.query.importModel.findFirst({
    where: { id: data.importId },
    with: { file: true },
  })
  if (!row) {
    logger.warn(`Import row not found: ${data.importId}`)
    return
  }
  if (!row.file) {
    logger.warn(`Import ${row.id} has no associated file`)
    await db
      .update(importModel)
      .set({
        status: "failed",
        errorMessage: "Associated file not found",
        completedAt: new Date(),
      })
      .where(eq(importModel.id, row.id))
    return
  }

  const parsedType = importTypes.safeParse(row.type)
  if (!parsedType.success) {
    logger.warn(`Unknown import type: ${row.type}`)
    await db
      .update(importModel)
      .set({
        status: "failed",
        errorMessage: `Unknown import type: ${row.type}`,
        completedAt: new Date(),
      })
      .where(eq(importModel.id, row.id))
    return
  }

  const parsedFormat = importFormats.safeParse(row.format)
  if (!parsedFormat.success) {
    logger.warn(`Unknown import format: ${row.format}`)
    await db
      .update(importModel)
      .set({
        status: "failed",
        errorMessage: `Unknown import format: ${row.format}`,
        completedAt: new Date(),
      })
      .where(eq(importModel.id, row.id))
    return
  }

  const handler = importHandlers[parsedType.data]
  const importRow: ImportRow = {
    ...row,
    file: row.file,
    format: parsedFormat.data,
  }

  try {
    await runImportPipeline(importRow, handler)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error(error, `Import ${row.id} fatal error`)
    await db
      .update(importModel)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(eq(importModel.id, row.id))
  }
}
