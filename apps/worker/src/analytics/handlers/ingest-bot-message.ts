import {
  BOT_MESSAGE_EVENTS_EVENT_TYPE,
  clickhouseClient,
} from "@aha.chat/analytics"
import { prisma } from "@aha.chat/database"
import { ClickhouseIngester } from "@aha.chat/filesystem/server"
import { S3Client } from "@aws-sdk/client-s3"
import { logger } from "../../lib/logger"
import {
  getClickhouseConfig,
  getS3StorageConfig,
} from "../config/storage.config"

const s3Config = getS3StorageConfig()
const clickhouseConfig = getClickhouseConfig()

const s3Client = new S3Client({
  endpoint: s3Config.endpoint,
  region: s3Config.region,
  credentials: {
    accessKeyId: s3Config.accessKey,
    secretAccessKey: s3Config.secretKey,
  },
  forcePathStyle: true,
})

const ingesterService = new ClickhouseIngester({
  s3Client,
  s3Endpoint: s3Config.endpoint,
  s3Bucket: s3Config.bucket,
  s3Prefix: BOT_MESSAGE_EVENTS_EVENT_TYPE,
  s3AccessKey: s3Config.accessKey,
  s3SecretKey: s3Config.secretKey,
  manifestStore: {
    async filterNotIngested(objectKeys) {
      if (objectKeys.length === 0) {
        return []
      }

      const ingested = await prisma.analyticsManifestStatus.findMany({
        where: {
          objectKey: { in: objectKeys },
          status: "ingested",
        },
        select: { objectKey: true },
      })

      const ingestedSet = new Set(ingested.map((r) => r.objectKey))
      return objectKeys.filter((k) => !ingestedSet.has(k))
    },

    async claimForProcessing(objectKey) {
      const rows = await prisma.$queryRaw<
        Array<{ attempts: number; status: string }>
      >`
        INSERT INTO "AnalyticsManifestStatus" ("objectKey", status, attempts)
        VALUES (${objectKey}, 'processing', 1)
        ON CONFLICT ("objectKey") DO UPDATE
        SET status = 'processing',
            attempts = "AnalyticsManifestStatus".attempts + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "AnalyticsManifestStatus".status NOT IN ('processing', 'ingested')
        RETURNING attempts, status
      `

      const first = rows[0]
      if (!first) {
        return null
      }

      return first.attempts
    },

    async markIngested(objectKey) {
      await prisma.$executeRaw`
        UPDATE "AnalyticsManifestStatus"
        SET status = 'ingested',
            "ingestedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "objectKey" = ${objectKey}
      `
    },

    async markFailed(objectKey, errorMessage) {
      await prisma.$executeRaw`
        UPDATE "AnalyticsManifestStatus"
        SET status = 'failed',
            "lastError" = ${errorMessage},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "objectKey" = ${objectKey}
      `
    },
  },
  clickhouseClient,
  clickhouseDatabase: clickhouseConfig.database,
  clickhouseTable: BOT_MESSAGE_EVENTS_EVENT_TYPE,
  batchSize: clickhouseConfig.batchSize,
  maxRetries: clickhouseConfig.maxRetries,
})

export const ingestBotMessageEvents = async (_job: unknown) => {
  logger.info("Starting bot message events ingestion to ClickHouse")

  try {
    await ingesterService.ingestCommittedFiles()
    logger.info("Bot message events ingestion completed")
  } catch (error) {
    logger.error("Bot message events ingestion failed", error)
    throw error
  }
}
