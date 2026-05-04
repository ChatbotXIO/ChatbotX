import { createId } from "@chatbotx.io/utils"
import { env } from "../key"
import type { CreateContactEvent } from "../schemas"
import { clickhouseEventWriter } from "./clickhouse-event-writer"

type Redis = {
  set: (
    key: string,
    value: string,
    mode: string,
    ttl: number,
    flag: string,
  ) => Promise<string | null>
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null
  const code = err?.code
  const message = (err?.message || "").toLowerCase()

  if (code) {
    return (
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "EAI_AGAIN"
    )
  }

  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("network")
  )
}

export abstract class BaseService {
  private redis?: Redis
  private dedupTTL = 3600

  private readonly dedupKeys = new Set<string>()

  private static bootstrapFn: (() => Promise<void>) | null = null
  private static spoolerWriteFn:
    | ((eventType: string, row: Record<string, unknown>) => Promise<void>)
    | null = null

  static registerBootstrap(fn: () => Promise<void>) {
    BaseService.bootstrapFn = fn
  }

  static registerSpoolerWriter(
    fn: (eventType: string, row: Record<string, unknown>) => Promise<void>,
  ) {
    BaseService.spoolerWriteFn = fn
  }

  protected async ensureBootstrapped(): Promise<void> {
    if (BaseService.bootstrapFn) {
      await BaseService.bootstrapFn()
    }
  }

  protected async writeToSpooler(
    eventType: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    if (!BaseService.spoolerWriteFn) {
      throw new Error(
        "Spooler writer not registered. Call BaseService.registerSpoolerWriter() first.",
      )
    }
    await BaseService.spoolerWriteFn(eventType, row)
  }

  protected async persistEvent(
    eventType: string,
    row: Record<string, unknown>,
    skipSpooler: boolean,
    serviceName: string,
  ): Promise<void> {
    if (skipSpooler) {
      await this.runSafely(async () => {
        const { getDefaultEventWriter } = await import("./event-writer-factory")
        const writer = getDefaultEventWriter()
        // biome-ignore lint/suspicious/noExplicitAny: Generic method accepts different event row types
        await writer.insertOne(eventType, row as any)
      }, `[${serviceName}] Direct insert failed`)
      return
    }

    await this.tryOrFallback(
      async () => {
        await this.writeToSpooler(eventType, row)
      },
      async () => {
        const { getDefaultEventWriter } = await import("./event-writer-factory")
        const writer = getDefaultEventWriter()
        // biome-ignore lint/suspicious/noExplicitAny: Generic method accepts different event row types
        await writer.insertOne(eventType, row as any)
      },
      `[${serviceName}] Spool write failed, fallback to direct insert`,
      `[${serviceName}] Direct insert failed`,
    )
  }

  protected async insertBatch(
    table: string,
    rows: unknown[],
    serviceName: string,
  ): Promise<void> {
    if (rows.length === 0) {
      return
    }

    await this.runSafely(async () => {
      await clickhouseEventWriter.insert(table, rows)
    }, `[${serviceName}] Batch insert failed for ${rows.length} rows`)
  }

  setRedis(redis: Redis, ttl = 3600) {
    this.redis = redis
    this.dedupTTL = ttl
  }

  protected async runSafely(
    fn: () => Promise<void>,
    errMsg: string,
  ): Promise<void> {
    try {
      await fn()
    } catch (error) {
      console.error(errMsg, error)
    }
  }

  protected async tryOrFallback(
    primary: () => Promise<void>,
    fallback: () => Promise<void>,
    pErr: string,
    fErr: string,
  ): Promise<void> {
    try {
      await primary()
    } catch (error) {
      console.error(pErr, error)
      await this.tryRetry(fallback, fErr)
    }
  }

  protected async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [200, 500]

    let lastErr: unknown
    for (let attempt = 0; attempt < delays.length + 1; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastErr = error
        if (attempt === delays.length || !isRetryableError(error)) {
          throw error
        }
        await sleep(delays[attempt] ?? 0)
      }
    }

    throw lastErr
  }

  protected async tryRetry(
    fn: () => Promise<void>,
    errMsg: string,
  ): Promise<void> {
    await this.runSafely(async () => {
      await this.executeWithRetry(fn)
    }, errMsg)
  }

  /**
   * Stable event_id for idempotency across retries.
   * Important: Do NOT use Date.now() here; must reflect the business event time.
   */
  protected getEventId(_event: CreateContactEvent | unknown): string {
    return createId()
  }

  protected async canWrite(row: {
    workspace_id: string
    contact_id?: string
    message_id?: string
    event_type: string
  }): Promise<boolean> {
    if (!env.ANALYTICS_ENABLED) {
      return false
    }

    if (!this.redis) {
      return true
    }

    const eventType = row.event_type

    if (!this.dedupKeys.has(eventType)) {
      return true
    }

    const hourTimestamp = Math.floor(Date.now() / (3600 * 1000)) * 3600
    const identifier = row.contact_id || row.message_id || "unknown"
    const key = `dedup:${row.workspace_id}:${identifier}:${eventType}:${hourTimestamp}`

    const result = await this.redis.set(key, "1", "EX", this.dedupTTL, "NX")

    return result === "OK"
  }

  protected get isAnalyticsEnabled(): boolean {
    return env.ANALYTICS_ENABLED
  }
}
