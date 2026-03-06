import { clickhouseClient } from "@aha.chat/analytics"
import { db, sql } from "@aha.chat/database/client"
import {
  ClickhouseIngester,
  type NdjsonIngestManifestStore,
} from "@aha.chat/filesystem/server"
import type { AnalyticsJobData } from "@aha.chat/worker-config"
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

const manifestStore: NdjsonIngestManifestStore = {
  async filterNotIngested(objectKeys) {
    if (objectKeys.length === 0) {
      return []
    }

    const result = await db.execute<{ objectKey: string }>(
      sql`
        SELECT "objectKey" FROM "AnalyticsManifestStatus"
        WHERE "objectKey" = ANY(${sql.raw(`ARRAY[${objectKeys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")}]`)})
        AND status = 'ingested'
      `,
    )

    const ingestedSet = new Set(result.rows.map((r) => r.objectKey))
    return objectKeys.filter((k) => !ingestedSet.has(k))
  },

  async claimForProcessing(objectKey) {
    const result = await db.execute<{ attempts: number; status: string }>(
      sql`
        INSERT INTO "AnalyticsManifestStatus" ("objectKey", status, attempts)
        VALUES (${objectKey}, 'processing', 1)
        ON CONFLICT ("objectKey") DO UPDATE
        SET status = 'processing',
            attempts = "AnalyticsManifestStatus".attempts + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "AnalyticsManifestStatus".status NOT IN ('processing', 'ingested')
        RETURNING attempts, status
      `,
    )

    const first = result.rows[0]
    if (!first) {
      return null
    }

    return first.attempts
  },

  async markIngested(objectKey) {
    await db.execute(
      sql`
        UPDATE "AnalyticsManifestStatus"
        SET status = 'ingested',
            "ingestedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "objectKey" = ${objectKey}
      `,
    )
  },

  async markFailed(objectKey, errorMessage) {
    await db.execute(
      sql`
        UPDATE "AnalyticsManifestStatus"
        SET status = 'failed',
            "lastError" = ${errorMessage},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "objectKey" = ${objectKey}
      `,
    )
  },
}

const ingesterCache = new Map<string, ClickhouseIngester>()

function getIngester(eventType: string): ClickhouseIngester {
  let ingester = ingesterCache.get(eventType)
  if (!ingester) {
    ingester = new ClickhouseIngester({
      s3Client,
      s3Endpoint: s3Config.endpoint,
      s3Bucket: s3Config.bucket,
      s3Prefix: eventType,
      s3AccessKey: s3Config.accessKey,
      s3SecretKey: s3Config.secretKey,
      manifestStore,
      clickhouseClient,
      clickhouseDatabase: clickhouseConfig.database,
      clickhouseTable: eventType,
      batchSize: clickhouseConfig.batchSize,
      maxRetries: clickhouseConfig.maxRetries,
    })
    ingesterCache.set(eventType, ingester)
  }
  return ingester
}

export const ingestEvents = async (data: AnalyticsJobData) => {
  const eventType = data.data.type
  logger.info(`Starting ${eventType} ingestion to ClickHouse`)

  try {
    await getIngester(eventType).ingestCommittedFiles()
    logger.info(`${eventType} ingestion completed`)
  } catch (error) {
    logger.error(error, `${eventType} ingestion failed`)
    throw error
  }
}
