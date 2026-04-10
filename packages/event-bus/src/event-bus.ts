import type { BaseEventListener } from "@chatbotx.io/flow-config"
import type { Redis } from "@chatbotx.io/redis"
import type { z } from "zod"

type EventMap = Record<string, unknown>

export interface EventBusConfig<TEventMap extends EventMap> {
  consumerGroup: string
  maxLen?: number
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

// biome-ignore lint/suspicious/noExplicitAny: Required for generic module storage
const activeModules: EventModule<any, any>[] = []

export async function startWorker(
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic module types
  modules: EventModule<any, any>[],
  consumerName?: string,
): Promise<void> {
  if (activeModules.length > 0) {
    await stopWorker()
  }

  const name =
    consumerName ??
    `worker-${process.env.HOSTNAME || "chatbotx"}-${process.pid}-${Date.now()}`

  for (const mod of modules) {
    activeModules.push(mod)
    await mod.bus.initialize()
    if (mod.init) {
      await mod.init()
    }
    mod.bus.startConsuming(name, mod.listeners)
  }
}

export async function stopWorker(): Promise<void> {
  for (const mod of activeModules) {
    mod.bus.stop()
  }

  await new Promise((resolve) => setTimeout(resolve, 2000))
  activeModules.length = 0
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

  async startConsuming(
    consumerName: string,
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
  ): Promise<void> {
    this.running = true

    while (this.running) {
      try {
        const results = (await this.redis.call(
          "XREADGROUP",
          "GROUP",
          this.config.consumerGroup,
          consumerName,
          "BLOCK",
          5000,
          "COUNT",
          10,
          "STREAMS",
          this.config.streamKey,
          ">",
        )) as [string, [string, string[]][]][] | null

        if (!results) {
          continue
        }

        for (const [, messages] of results) {
          const parsedMessages = messages.map(([messageId, fields]) => ({
            messageId,
            ...this.parseStreamMessage(fields),
          }))

          const processResults = await this.processEvents(
            parsedMessages,
            listeners,
          )

          const messageIds = parsedMessages.map((m) => m.messageId)
          await this.redis.xack(
            this.config.streamKey,
            this.config.consumerGroup,
            ...messageIds,
          )

          const successIds = processResults
            .filter((r) => r.success)
            .map((r) => r.messageId)

          if (successIds.length > 0) {
            await this.redis.xdel(this.config.streamKey, ...successIds)
          }
        }
      } catch (error) {
        console.error("[EventBus] Consumer error:", error)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }

  stop(): void {
    this.running = false
  }

  protected async processEvents(
    messages: Array<{ messageId: string; type: string; payload: unknown }>,
    listeners: Partial<Record<keyof TEventMap, TListener[]>>,
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

        const payloads = typeMessages.map(
          (m) => m.payload as TEventMap[keyof TEventMap],
        )

        const handlerResults = await Promise.allSettled(
          applicableListeners.map(async (listener) => {
            await listener.handler?.(payloads)
          }),
        )

        const failed = handlerResults.filter(
          (r) => r.status === "rejected",
        ).length
        const success = failed === 0

        for (const msg of typeMessages) {
          resultMap.set(msg.messageId, success)
        }
      }),
    )

    return messages.map((msg) => ({
      messageId: msg.messageId,
      success: resultMap.get(msg.messageId) ?? true,
    }))
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
}
