import { getAnalyticsConfig, parseTmpFilename } from "@aha.chat/analytics"
import {
  NdjsonCleaner,
  NdjsonFinalizer,
  NdjsonS3Uploader,
} from "@aha.chat/filesystem/server"
import type { AnalyticsJobData } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

let isContactRunning: Date | null = null
const expirationTime = 30 * 60 * 1000

export const syncContact = async (data: AnalyticsJobData) => {
  const now = new Date()

  if (
    isContactRunning &&
    now.getTime() - isContactRunning.getTime() < expirationTime
  ) {
    logger.info("Sync contact is running")
    return
  }

  isContactRunning = now

  try {
    // logger.info("Sync contact", { data })
    const eventType = data.data.type

    const cfg = getAnalyticsConfig(eventType)

    if (!cfg) {
      logger.error("Analytics config not found", { eventType })
      return
    }

    const finalizer = new NdjsonFinalizer({
      rootPath: cfg.uploader.rootPath,
      parseFilename: parseTmpFilename,
    })

    const uploader = new NdjsonS3Uploader(cfg.uploader)
    const cleaner = new NdjsonCleaner({ rootPath: cfg.uploader.rootPath })
    const maxAgeMs = cfg.finalize.maxAgeMs

    const results = await Promise.allSettled([
      finalizer.finalizeTmpFiles(maxAgeMs),
      uploader.uploadReadyFiles(),
      cleaner.cleanupEmptyDirs(),
    ])

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(`Task ${index} failed`, result.reason)
      }
    })
  } finally {
    // reset running status
    isContactRunning = null
  }
}
