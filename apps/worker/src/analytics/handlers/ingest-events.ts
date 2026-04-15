import { clickhouse } from "@chatbotx.io/clickhouse/client"
import { db, eq, sql } from "@chatbotx.io/database/client"
import { analyticsManifestStatusModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import {
  ClickhouseIngester,
  type NdjsonIngestManifestStore,
} from "@chatbotx.io/filesystem/server"
import type { AnalyticsJobData } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { getClickhouseConfig } from "../config/storage.config"

const clickhouseConfig = getClickhouseConfig()

const ingestedCache = new Map<string, number>()
const CACHE_TTL = 5 * 60 * 1000

const manifestStore: NdjsonIngestManifestStore = {
  async filterNotIngested(objectKeys) {
    if (objectKeys.length === 0) {
      return []
    }

    const now = Date.now()
    const uncached: string[] = []
    const cachedIngested = new Set<string>()

    for (const key of objectKeys) {
      const cachedTime = ingestedCache.get(key)
      if (cachedTime && now - cachedTime <= CACHE_TTL) {
        cachedIngested.add(key)
      } else {
        uncached.push(key)
      }
    }

    if (uncached.length === 0) {
      return objectKeys.filter((k) => !cachedIngested.has(k))
    }

    const result = await db.execute<{ objectKey: string }>(
      sql`
        SELECT "objectKey" FROM "AnalyticsManifestStatus"
        WHERE "objectKey" = ANY(${sql.raw(`ARRAY[${uncached.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")}]`)})
        AND status = 'ingested'
      `,
    )

    for (const row of result.rows) {
      ingestedCache.set(row.objectKey, now)
      cachedIngested.add(row.objectKey)
    }

    return objectKeys.filter((k) => !cachedIngested.has(k))
  },

  async claimForProcessing(objectKey) {
    const result = await db.execute<{ attempts: number; status: string }>(
      sql`
        INSERT INTO "AnalyticsManifestStatus" ("objectKey", status, attempts)
        VALUES (${objectKey}, 'processing', 1)
        ON CONFLICT ("objectKey") DO UPDATE
        SET status = 'processing',
            attempts = "AnalyticsManifestStatus".attempts + 1,
            "ingestedAt" = CURRENT_TIMESTAMP
        WHERE "AnalyticsManifestStatus".status NOT IN ('processing', 'ingested')
           OR ("AnalyticsManifestStatus".status = 'processing'
               AND "AnalyticsManifestStatus"."ingestedAt" < CURRENT_TIMESTAMP - INTERVAL '60 minutes')
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
    await db
      .update(analyticsManifestStatusModel)
      .set({
        status: "ingested",
        ingestedAt: new Date(),
      })
      .where(eq(analyticsManifestStatusModel.objectKey, objectKey))
    ingestedCache.set(objectKey, Date.now())
  },

  async markFailed(objectKey, errorMessage) {
    await db
      .update(analyticsManifestStatusModel)
      .set({
        status: "failed",
        lastError: errorMessage,
        ingestedAt: new Date(),
      })
      .where(eq(analyticsManifestStatusModel.objectKey, objectKey))
  },
}

const ingesterCache = new Map<string, ClickhouseIngester>()

function getIngester(eventType: string): ClickhouseIngester {
  let ingester = ingesterCache.get(eventType)
  if (!ingester) {
    ingester = new ClickhouseIngester({
      s3Client: uploader,
      s3Prefix: eventType,
      manifestStore,
      clickhouseClient: clickhouse,
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
  // logger.info(`Starting ${eventType} ingestion to ClickHouse`)

  try {
    await getIngester(eventType).ingestCommittedFiles()
    // logger.info(`${eventType} ingestion completed`)
  } catch (error) {
    logger.error(error, `${eventType} ingestion failed`)
    throw error
  }
}
