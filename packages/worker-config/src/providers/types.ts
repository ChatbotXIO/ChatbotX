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

export const providerTypes = z.enum(["bullmq", "kafka"])
export type ProviderType =
  (typeof providerTypes.enum)[keyof typeof providerTypes.enum]

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

export const KafkaConsumerConfigSchema = ConsumerConfigSchema.extend({
  partitions: z.number().optional().default(3),
  replicationFactor: z.number().optional().default(1),
  sessionTimeout: z.number().optional().default(30_000),
  heartbeatInterval: z.number().optional().default(3000),
})
export type KafkaConsumerConfig = z.input<typeof KafkaConsumerConfigSchema>

export const DEFAULT_KAFKA_CONSUMER_CONFIG = {
  partitions: 3,
  replicationFactor: 1,
  sessionTimeout: 30_000,
  heartbeatInterval: 3000,
} as const
