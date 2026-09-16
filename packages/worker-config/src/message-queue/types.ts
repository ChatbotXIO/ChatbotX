import { z } from "zod"

export const MessagePayloadSchema = z.object({
  key: z.string(),
  value: z.string(),
})
export type MessagePayload = z.infer<typeof MessagePayloadSchema>

export interface MessagingProducer {
  close(): Promise<void>
  send(messages: MessagePayload[]): Promise<void>
}

export interface MessagingConsumer {
  close(): Promise<void>
  consume(handler: (payload: string) => Promise<void>): Promise<void>
  isRunning(): boolean
}

export const ProducerConfigSchema = z.object({
  topic: z.string(),
  clientId: z.string().optional(),
})
export type ProducerConfig = z.infer<typeof ProducerConfigSchema>

export const ConsumerConfigSchema = z.object({
  topic: z.string(),
  clientId: z.string().optional(),
  groupId: z.string().optional(),
  concurrency: z.number().optional().default(100),
  removeOnComplete: z.number().optional().default(1000),
  removeOnFail: z.number().optional().default(5000),
})
export type ConsumerConfig = z.input<typeof ConsumerConfigSchema>

export const DEFAULT_CONSUMER_CONFIG = {
  concurrency: 100,
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const
