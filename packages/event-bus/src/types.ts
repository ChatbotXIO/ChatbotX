import { z } from "zod"

export type EventHandler<TPayload> = (payload: TPayload) => Promise<void>

// Utility type to infer EventMap from schemas object
export type InferEventMap<T extends Record<string, z.ZodType>> = {
  [K in keyof T]: z.infer<T[K]>
}

export interface BaseEventListener<TPayload = never> {
  handler?(payloads: TPayload[]): Promise<void> | void
  name: string
  priority?: number
}

export const BaseEventType = z.record(z.string(), z.string())
export type BaseEventType = z.infer<typeof BaseEventType>

// biome-ignore lint/suspicious/noExplicitAny: Required for generic type constraint flexibility
export type EventMap = { [key: string]: any }

export interface RedisStreamConfig {
  consumerGroup: string
  maxLen?: number
  streamKey: string
}
