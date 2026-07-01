import {
  type BaseEventListener,
  EVENT_BUS_MESSAGE_ID,
} from "@chatbotx.io/flow-config"
import type { Redis } from "@chatbotx.io/redis"
import type { z } from "zod"
import { deadLetterLogger, logger } from "./logger"

type EventMap = Record<string, unknown>
type StreamMessage = { messageId: string; type: string; payload: unknown }

export interface EventBusConfig<TEventMap extends EventMap> {
  claimBatchSize?: number
  claimIdleMs?: number
  claimIntervalMs?: number
  consumerGroup: string
  deadLetterMaxLen?: number
  deadLetterStreamKey?: string
  enableSelectiveRetry?: boolean
  maxDeliveries?: number
  maxLen?: number
  processTimeoutMs?: number
  readBatchSize?: number
  schemas: { [K in keyof TEventMap]: z.ZodType<TEventMap[K]> }
  streamKey: string
}

export type PayloadTransformer<TEventMap extends EventMap> = <
  K extends keyof TEventMap,
>(
  eventType: K,
  payload: TEventMap[K],
) => TEventMap[K]

export interface EventModule<
  TEventMap extends EventMap = EventMap,
  TListener extends BaseEventListener<
    TEventMap[keyof TEventMap]
  > = BaseEventListener<TEventMap[keyof TEventMap]>,
> {
  bus: BaseEventBus<TEventMap, TListener>
  init?: () => Promise<void> | void
  listeners: Partial<Record<keyof TEventMap, TListener[]>>
}

export class BaseEventBus<
  TEventMap extends EventMap,
  TListener extends BaseEventListener<
    TEventMap[keyof TEventMap]
  > = BaseEventListener<TEventMap[keyof TEventMap]>,
> {
  protected redis: Redis
  protected config: EventBusConfig<TEventMap>
  private initialized = false
  private payloadHandler?: PayloadTransformer<TEventMap>

  constructor(redis: Redis, config: EventBusConfig<TEventMap>) {
    this.redis = redis
    this.config = config
  }

  getConfig() {
    return this.config
  }

  setPayloadHandler(transformer: PayloadTransformer<TEventMap>) {
    this.payloadHandler = transformer

    return this
  }

  async initialize(): Promise<this> {
    if (this.initialized) {
      return this
    }

    try {
      await this.redis.xgroup(
        "CREATE",
        this.config.streamKey,
        this.config.consumerGroup,
        "0",
        "MKSTREAM",
      )
    } catch (err) {
      const error = err as Error
      if (!error.message?.includes("BUSYGROUP")) {
        throw err
      }
    }

    this.initialized = true

    return this
  }

  async emit<K extends keyof TEventMap & string>(
    eventType: K,
    payload: TEventMap[K],
  ): Promise<string> {
    const transformedPayload = this.payloadHandler
      ? this.payloadHandler(eventType, payload)
      : payload

    const schema = this.config.schemas[eventType]
    if (schema) {
      const result = schema.safeParse(transformedPayload)
      if (!result.success) {
        console.error("[EventBus] Invalid payload:", result.error.issues)
        return ""
      }
    }

    const data = {
      type: eventType,
      payload: JSON.stringify(transformedPayload),
      timestamp: Date.now().toString(),
    }

    const id = this.config.maxLen
      ? await this.redis.xadd(
          this.config.streamKey,
          "MAXLEN",
          "~",
          this.config.maxLen,
          "*",
          "type",
          data.type,
          "payload",
          data.payload,
          "timestamp",
          data.timestamp,
        )
      : await this.redis.xadd(
          this.config.streamKey,
          "*",
          "type",
          data.type,
          "payload",
          data.payload,
          "timestamp",
          data.timestamp,
        )
    return id as string
  }

  private running = false
  protected blockingRedis?: Redis
  private currentConsumerName?: string
  private lastClaimAt = Number.NEGATIVE_INFINITY
  private readonly lastProcessingErrors = new Map<string, string>()

  async startConsuming(
    consumerName: string,
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
  ): Promise<void> {
    this.running = true
    this.currentConsumerName = consumerName
    this.blockingRedis = this.redis.duplicate()

    try {
      while (this.running) {
        try {
          await this.consumeOnce(consumerName, listeners)
        } catch (error) {
          logger.error(
            { err: error, stream: this.config.streamKey },
            "[EventBus] consume loop error",
          )
          if (this.running) {
            await sleep(1000)
          }
        }
      }
    } finally {
      await this.closeBlockingRedis()
    }
  }

  protected async consumeOnce(
    consumerName: string,
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
  ): Promise<void> {
    const redis = this.blockingRedis ?? this.redis
    await this.reclaimStaleEntries(consumerName, listeners)

    const results = (await redis.call(
      "XREADGROUP",
      "GROUP",
      this.config.consumerGroup,
      consumerName,
      "BLOCK",
      5000,
      "COUNT",
      this.config.readBatchSize ?? 500,
      "STREAMS",
      this.config.streamKey,
      ">",
    )) as [string, [string, string[]][]][] | null

    if (!results) {
      return
    }

    for (const [, messages] of results) {
      const parsedMessages = messages.map(([messageId, fields]) => ({
        messageId,
        ...this.parseStreamMessage(fields),
      }))
      await this.processAndAck(parsedMessages, listeners)

      // XDEL intentionally omitted: stream entries are retained until
      // evicted by MAXLEN so multiple consumer groups can read each message.
    }
  }

  cloneForGroup(groupName: string): BaseEventBus<TEventMap, TListener> {
    return new BaseEventBus<TEventMap, TListener>(this.redis, {
      ...this.config,
      consumerGroup: groupName,
    })
  }

  stop(): void {
    this.running = false
  }

  async deregister(): Promise<void> {
    try {
      if (
        this.currentConsumerName &&
        (await this.canDeleteConsumer(this.currentConsumerName))
      ) {
        await this.redis.xgroup(
          "DELCONSUMER",
          this.config.streamKey,
          this.config.consumerGroup,
          this.currentConsumerName,
        )
      }
    } catch (error) {
      logger.error({ err: error }, "[EventBus] DELCONSUMER failed")
    }
    // Note: the blocking connection is owned and closed by startConsuming's
    // finally when the consume loop exits — closing it here would race a loop
    // that may still be mid-command during shutdown.
  }

  private async canDeleteConsumer(consumerName: string): Promise<boolean> {
    try {
      const pendingEntries = (await this.redis.call(
        "XPENDING",
        this.config.streamKey,
        this.config.consumerGroup,
        "-",
        "+",
        1,
        consumerName,
      )) as unknown[]

      if (pendingEntries.length === 0) {
        return true
      }

      logger.warn(
        {
          consumerName,
          pending: pendingEntries.length,
          stream: this.config.streamKey,
        },
        "[EventBus] skipping DELCONSUMER because messages are still pending",
      )
      return false
    } catch (error) {
      logger.error(
        { err: error, stream: this.config.streamKey, consumerName },
        "[EventBus] skipping DELCONSUMER after XPENDING failed",
      )
      return false
    }
  }

  protected async processEvents(
    messages: StreamMessage[],
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
    signal?: AbortSignal,
  ): Promise<Array<{ messageId: string; success: boolean }>> {
    const messagesByType = new Map<string, typeof messages>()
    for (const msg of messages) {
      const existing = messagesByType.get(msg.type) ?? []
      existing.push(msg)
      messagesByType.set(msg.type, existing)
    }

    const resultMap = new Map<string, boolean>()

    await Promise.all(
      Array.from(messagesByType.entries()).map(async ([type, typeMessages]) => {
        const eventListeners = listeners[type as keyof TEventMap] ?? []
        const applicableListeners = eventListeners.filter(
          (l) => typeof l.handler === "function",
        )

        if (applicableListeners.length === 0) {
          for (const msg of typeMessages) {
            resultMap.set(msg.messageId, true)
          }
          return
        }

        const payloads = typeMessages.map((m) =>
          this.attachEventBusMetadata(m.payload, m.messageId),
        ) as TEventMap[keyof TEventMap][]
        const knownMessageIds = new Set(
          typeMessages.map((msg) => msg.messageId),
        )
        const failedMessageIds = new Set<string>()

        await Promise.all(
          applicableListeners.map(async (listener) => {
            const startedAt = Date.now()
            let success = false
            try {
              const handlerResult = await listener.handler?.(payloads, signal)
              const listenerFailedIds = getFailedMessageIds(
                handlerResult,
                knownMessageIds,
              )
              if (listenerFailedIds.length > 0) {
                for (const messageId of listenerFailedIds) {
                  failedMessageIds.add(messageId)
                }
                this.rememberProcessingError(
                  listenerFailedIds,
                  `listener ${listener.name} reported failedMessageIds`,
                )
              }
              success = listenerFailedIds.length === 0
            } catch (error) {
              const listenerMessageIds = typeMessages.map(
                (msg) => msg.messageId,
              )
              for (const messageId of listenerMessageIds) {
                failedMessageIds.add(messageId)
              }
              this.rememberProcessingError(listenerMessageIds, error)
              logger.error(
                {
                  err: error,
                  streamKey: this.config.streamKey,
                  eventType: type,
                  listener: listener.name,
                  count: payloads.length,
                },
                "[EventBus] listener handler failed",
              )
            } finally {
              logger.debug(
                {
                  count: payloads.length,
                  durationMs: Date.now() - startedAt,
                  eventType: type,
                  listener: listener.name,
                  stream: this.config.streamKey,
                  success,
                },
                "[EventBus] listener processed",
              )
            }
          }),
        )

        for (const msg of typeMessages) {
          resultMap.set(msg.messageId, !failedMessageIds.has(msg.messageId))
        }
      }),
    )

    return messages.map((msg) => ({
      messageId: msg.messageId,
      success: resultMap.get(msg.messageId) ?? true,
    }))
  }

  private attachEventBusMetadata(payload: unknown, messageId: string): unknown {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return {
        ...(payload as Record<string, unknown>),
        [EVENT_BUS_MESSAGE_ID]: messageId,
      }
    }

    return payload
  }

  private parseStreamMessage(fields: string[]): {
    type: string
    payload: unknown
  } {
    const data: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1]
    }

    return { type: data.type, payload: JSON.parse(data.payload) }
  }

  private async processAndAck(
    messages: StreamMessage[],
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
  ): Promise<void> {
    const timeoutMs = this.config.processTimeoutMs ?? 120_000
    const startedAt = Date.now()
    const abortController = new AbortController()
    let timer: NodeJS.Timeout | undefined
    const watchdog = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abortController.abort()
        reject(new ProcessTimeoutError(timeoutMs))
      }, timeoutMs)
    })

    try {
      const results = await Promise.race([
        this.processEvents(messages, listeners, abortController.signal),
        watchdog,
      ])
      const failed = results.filter((result) => !result.success).length
      const selectiveRetry = this.config.enableSelectiveRetry === true
      if (failed > 0) {
        if (selectiveRetry) {
          logger.warn(
            { failed, stream: this.config.streamKey, total: results.length },
            "[EventBus] leaving failed messages unacked for retry",
          )
        } else {
          logger.warn(
            { failed, stream: this.config.streamKey, total: results.length },
            "[EventBus] acking batch despite handler failures",
          )
        }
      }

      const ackMessageIds = selectiveRetry
        ? results
            .filter((result) => result.success)
            .map((result) => result.messageId)
        : messages.map((message) => message.messageId)

      if (ackMessageIds.length > 0) {
        await (this.blockingRedis ?? this.redis).xack(
          this.config.streamKey,
          this.config.consumerGroup,
          ...ackMessageIds,
        )
        this.forgetProcessingErrors(ackMessageIds)
      }

      logger.debug(
        {
          acked: ackMessageIds.length,
          durationMs: Date.now() - startedAt,
          failed,
          stream: this.config.streamKey,
          total: messages.length,
        },
        "[EventBus] batch processed",
      )
    } catch (error) {
      // A watchdog timeout is expected/handled: leave the batch unacked so it
      // stays in the PEL and gets retried via reclaim. Re-throw anything else.
      if (error instanceof ProcessTimeoutError) {
        this.rememberProcessingError(
          messages.map((message) => message.messageId),
          error,
        )
        logger.warn(
          {
            count: messages.length,
            stream: this.config.streamKey,
            timeoutMs,
          },
          "[EventBus] batch processing timed out; leaving unacked for reclaim",
        )
        return
      }
      throw error
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  private async reclaimStaleEntries(
    consumerName: string,
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
  ): Promise<void> {
    const now = Date.now()
    if (now - this.lastClaimAt < (this.config.claimIntervalMs ?? 30_000)) {
      return
    }

    this.lastClaimAt = now
    try {
      const redis = this.blockingRedis ?? this.redis
      const [, claimed] = (await redis.xautoclaim(
        this.config.streamKey,
        this.config.consumerGroup,
        consumerName,
        this.config.claimIdleMs ?? 180_000,
        "0",
        "COUNT",
        this.config.claimBatchSize ?? this.config.readBatchSize ?? 500,
      )) as [string, [string, string[]][], string[]]

      if (!claimed?.length) {
        return
      }

      const parsedMessages = claimed.map(([messageId, fields]) => ({
        messageId,
        ...this.parseStreamMessage(fields),
      }))
      const retryableMessages: StreamMessage[] = []
      for (const message of parsedMessages) {
        const deliveryCount = await this.getDeliveryCount(
          message.messageId,
          consumerName,
        )
        if (deliveryCount > (this.config.maxDeliveries ?? 5)) {
          await this.moveToDeadLetter(message, deliveryCount)
        } else {
          retryableMessages.push(message)
        }
      }

      if (retryableMessages.length > 0) {
        await this.processAndAck(retryableMessages, listeners)
      }
    } catch (error) {
      logger.error(
        { err: error, stream: this.config.streamKey },
        "[EventBus] reclaim failed",
      )
    }
  }

  private async getDeliveryCount(
    messageId: string,
    consumerName: string,
  ): Promise<number> {
    const pending = (await this.redis.call(
      "XPENDING",
      this.config.streamKey,
      this.config.consumerGroup,
      messageId,
      messageId,
      1,
      consumerName,
    )) as unknown
    if (!Array.isArray(pending)) {
      return 1
    }
    const firstEntry = pending[0]

    if (Array.isArray(firstEntry)) {
      const deliveryCount = Number(firstEntry[3])
      if (Number.isFinite(deliveryCount) && deliveryCount > 0) {
        return deliveryCount
      }
    }

    return 1
  }

  private async moveToDeadLetter(
    message: StreamMessage,
    deliveryCount: number,
  ): Promise<void> {
    const deadLetterStreamKey =
      this.config.deadLetterStreamKey ?? `${this.config.streamKey}:dead`
    const error =
      this.lastProcessingErrors.get(message.messageId) ??
      "max deliveries exceeded"

    await this.redis.xadd(
      deadLetterStreamKey,
      "MAXLEN",
      "~",
      this.config.deadLetterMaxLen ?? 100_000,
      "*",
      "type",
      message.type,
      "payload",
      JSON.stringify(message.payload),
      "originalId",
      message.messageId,
      "deliveryCount",
      String(deliveryCount),
      "error",
      error,
      "timestamp",
      Date.now().toString(),
    )
    await this.redis.xack(
      this.config.streamKey,
      this.config.consumerGroup,
      message.messageId,
    )
    this.forgetProcessingErrors([message.messageId])

    deadLetterLogger.error(
      {
        deadLetterStreamKey,
        deliveryCount,
        messageId: message.messageId,
        stream: this.config.streamKey,
      },
      "[EventBus] moved message to dead-letter stream",
    )
  }

  private rememberProcessingError(messageIds: string[], error: unknown): void {
    const message = getErrorMessage(error)
    for (const messageId of messageIds) {
      this.lastProcessingErrors.set(messageId, message)
    }
  }

  private forgetProcessingErrors(messageIds: string[]): void {
    for (const messageId of messageIds) {
      this.lastProcessingErrors.delete(messageId)
    }
  }

  private async closeBlockingRedis(): Promise<void> {
    const redis = this.blockingRedis
    this.blockingRedis = undefined
    if (!redis) {
      return
    }

    await redis.quit().catch(() => redis.disconnect())
  }
}

class ProcessTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`processEvents timed out after ${timeoutMs}ms`)
    this.name = "ProcessTimeoutError"
  }
}

function getFailedMessageIds(
  result: unknown,
  knownMessageIds: Set<string>,
): string[] {
  if (!result || typeof result !== "object") {
    return []
  }

  const failedMessageIds = (result as { failedMessageIds?: unknown })
    .failedMessageIds
  if (!Array.isArray(failedMessageIds)) {
    return []
  }

  return failedMessageIds.filter((messageId) => knownMessageIds.has(messageId))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "unknown processing error"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
