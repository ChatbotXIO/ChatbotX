import { NDJSON_EXT } from "@aha.chat/filesystem"

export const CONTACT_EVENTS_EVENT_TYPE = "contact_events"
export const CONVERSATION_EVENTS_EVENT_TYPE = "conversation_events"
export const BOT_MESSAGE_EVENTS_EVENT_TYPE = "bot_message_events"

export interface NdjsonTmpFilename {
  eventType: string
  instanceId: string
  timestamp: number
  seq: number
}

export function buildTmpFilename(params: NdjsonTmpFilename): string {
  return `${params.eventType}_${params.instanceId}_${params.timestamp}_${params.seq}${NDJSON_EXT.TMP}`
}

export function parseTmpFilename(filename: string): NdjsonTmpFilename | null {
  const basename = filename.replace(NDJSON_EXT.TMP, "")
  const parts = basename.split("_")
  if (parts.length < 4) {
    return null
  }
  const timestamp = Number(parts.at(-2))
  const seq = Number(parts.at(-1))
  if (!(Number.isFinite(timestamp) && Number.isFinite(seq))) {
    return null
  }
  const eventType = parts.slice(0, -3).join("_")
  const instanceId = parts.at(-3) || ""
  return { eventType, instanceId, timestamp, seq }
}

type AnalyticsContactConfig = {
  eventType: string
  spool: {
    rootPath: string
    acceptWindowSeconds: number
  }
  uploader: {
    rootPath: string
    s3Prefix: string
    concurrency: number
  }
  finalize: {
    maxAgeMs: number
  }
}

type AnalyticsConfig = {
  [CONTACT_EVENTS_EVENT_TYPE]: AnalyticsContactConfig
  [CONVERSATION_EVENTS_EVENT_TYPE]: AnalyticsContactConfig
  [BOT_MESSAGE_EVENTS_EVENT_TYPE]: AnalyticsContactConfig
}

const defaultConfig = {
  rootPath: "/var/spool/analytics",
  acceptWindowSeconds: 10_000,
  concurrency: 3,
  maxBatchSize: 10_000,
  redisTTL: 7200, // 2 hours
}

export function getDefaultSpoolerConfig(): {
  rootPath: string
  acceptWindowSeconds: number
} {
  return {
    rootPath: process.env.ANALYTICS_SPOOL_PATH || defaultConfig.rootPath,
    acceptWindowSeconds:
      Number(process.env.ANALYTICS_ACCEPT_WINDOW_SECONDS) ||
      defaultConfig.acceptWindowSeconds,
  }
}

export function getAnalyticsConfig(
  key: keyof AnalyticsConfig,
): AnalyticsContactConfig {
  const config = {
    ...getDefaultSpoolerConfig(),
    concurrency:
      Number(process.env.ANALYTICS_UPLOAD_CONCURRENCY) ||
      defaultConfig.concurrency,
  }

  const result = {
    [CONTACT_EVENTS_EVENT_TYPE]: {
      eventType: CONTACT_EVENTS_EVENT_TYPE,
      spool: {
        rootPath: config.rootPath,
        acceptWindowSeconds: config.acceptWindowSeconds,
      },
      uploader: {
        rootPath: config.rootPath,
        s3Prefix: CONTACT_EVENTS_EVENT_TYPE,
        concurrency: config.concurrency,
      },
      finalize: {
        maxAgeMs: config.acceptWindowSeconds + 2000,
      },
    },
    [CONVERSATION_EVENTS_EVENT_TYPE]: {
      eventType: CONVERSATION_EVENTS_EVENT_TYPE,
      spool: {
        rootPath: config.rootPath,
        acceptWindowSeconds: config.acceptWindowSeconds,
      },
      uploader: {
        rootPath: config.rootPath,
        s3Prefix: CONVERSATION_EVENTS_EVENT_TYPE,
        concurrency: config.concurrency,
      },
      finalize: {
        maxAgeMs: config.acceptWindowSeconds + 2000,
      },
    },
    [BOT_MESSAGE_EVENTS_EVENT_TYPE]: {
      eventType: BOT_MESSAGE_EVENTS_EVENT_TYPE,
      spool: {
        rootPath: config.rootPath,
        acceptWindowSeconds: config.acceptWindowSeconds,
      },
      uploader: {
        rootPath: config.rootPath,
        s3Prefix: BOT_MESSAGE_EVENTS_EVENT_TYPE,
        concurrency: config.concurrency,
      },
      finalize: {
        maxAgeMs: config.acceptWindowSeconds + 2000,
      },
    },
  }

  if (key in result) {
    return result[key]
  }

  throw new Error(`Config key ${key} not found`)
}
