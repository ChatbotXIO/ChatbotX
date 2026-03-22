import {
  NdjsonCleaner,
  NdjsonFinalizer,
  NdjsonS3Uploader,
} from "@aha.chat/filesystem/server"
import type { AnalyticsJobData } from "@aha.chat/worker-config"
import { getAnalyticsConfig, parseTmpFilename } from "@chatbotx.io/analytics"
import { logger } from "../../lib/logger"

const runningJobs = new Map<string, Date>()
const EXPIRATION_MS = 30 * 60 * 1000

export const syncEvents = async (data: AnalyticsJobData) => {
  const eventType = data.data.type
  const now = new Date()
  const lastRun = runningJobs.get(eventType)

  if (lastRun && now.getTime() - lastRun.getTime() < EXPIRATION_MS) {
    logger.info(`Sync ${eventType} is already running`)
    return
  }

  runningJobs.set(eventType, now)

  try {
    const cfg = getAnalyticsConfig(eventType)

    if (!cfg) {
      logger.error(`[syncEvents] Analytics config not found for: ${eventType}`)
      return
    }

    const finalizer = new NdjsonFinalizer({
      rootPath: cfg.uploader.rootPath,
      parseFilename: parseTmpFilename,
    })

    const uploader = new NdjsonS3Uploader(cfg.uploader)
    const cleaner = new NdjsonCleaner({ rootPath: cfg.uploader.rootPath })

    const results = await Promise.allSettled([
      finalizer.finalizeTmpFiles(cfg.finalize.maxAgeMs),
      uploader.uploadReadyFiles(),
      cleaner.cleanupEmptyDirs(),
      cleaner.cleanupUploadedFiles(),
    ])

    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(result.reason, `[syncEvents:${eventType}] Task failed`)
      }
    }
  } finally {
    runningJobs.delete(eventType)
  }
}
