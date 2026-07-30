import { importService } from "@chatbotx.io/business"
import { importFormats, importTypes } from "@chatbotx.io/database/partials"
import type { JobRunImport } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { type ImportRow, importHandlers, runImportPipeline } from "./imports"

export const runImport = async (data: JobRunImport["data"]): Promise<void> => {
  const row = await importService.findForWorker(data.importId)
  if (!row) {
    logger.warn(`Import row not found: ${data.importId}`)
    return
  }
  if (!row.file) {
    logger.warn(`Import ${row.id} has no associated file`)
    await importService.fail(row.id, "Associated file not found")
    return
  }

  const parsedType = importTypes.safeParse(row.type)
  if (!parsedType.success) {
    logger.warn(`Unknown import type: ${row.type}`)
    await importService.fail(row.id, `Unknown import type: ${row.type}`)
    return
  }

  const parsedFormat = importFormats.safeParse(row.format)
  if (!parsedFormat.success) {
    logger.warn(`Unknown import format: ${row.format}`)
    await importService.fail(row.id, `Unknown import format: ${row.format}`)
    return
  }

  const importRow: ImportRow = {
    ...row,
    file: row.file,
    format: parsedFormat.data,
  }
  const importType = parsedType.data

  try {
    switch (importType) {
      case "contacts":
        await runImportPipeline(importRow, importHandlers.contacts)
        break
      case "coupons":
        await runImportPipeline(importRow, importHandlers.coupons)
        break
      case "products":
        await runImportPipeline(importRow, importHandlers.products)
        break
      default: {
        const exhaustiveType: never = importType
        throw new Error(`Unsupported import type: ${exhaustiveType}`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error(error, `Import ${row.id} fatal error`)
    await importService.fail(row.id, message)
  }
}
