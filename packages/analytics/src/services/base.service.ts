import { createId } from "@paralleldrive/cuid2"
import type { CreateContactEvent } from "../models"

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

  private readonly dedupKeys = new Set<string>(["contact_message_in"])

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
    chatbot_id: string
    contact_id?: string
    message_id?: string
    event_type: string
  }): Promise<boolean> {
    if (!this.redis) {
      return true
    }

    const eventType = row.event_type

    if (!this.dedupKeys.has(eventType)) {
      return true
    }

    const hourTimestamp = Math.floor(Date.now() / (3600 * 1000)) * 3600
    const identifier = row.contact_id || row.message_id || "unknown"
    const key = `dedup:${row.chatbot_id}:${identifier}:${eventType}:${hourTimestamp}`

    const result = await this.redis.set(key, "1", "EX", this.dedupTTL, "NX")

    return result === "OK"
  }
}
