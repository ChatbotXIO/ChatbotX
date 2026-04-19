import type { Readable } from "node:stream"
import {
  type Consumer,
  createConsumer,
  createProducer,
  ensureTopicExists,
  type Producer,
} from "@chatbotx.io/kafka"
import {
  DEFAULT_KAFKA_CONSUMER_CONFIG,
  type KafkaConsumerConfig,
  type MessagePayload,
  type MessagingConsumer,
  type MessagingProducer,
  type ProducerConfig,
} from "./types"

export class KafkaProducer implements MessagingProducer {
  private readonly producer: Producer<string, string, string, string>
  private readonly topic: string

  constructor(config: ProducerConfig) {
    this.topic = config.topic
    this.producer = createProducer(config.clientId || "sequence-scheduler")
  }

  async send(messages: MessagePayload[]): Promise<void> {
    const kafkaMessages = messages.map((msg) => ({
      topic: this.topic,
      key: msg.key,
      value: msg.value,
    }))

    await this.producer.send({ messages: kafkaMessages })
  }

  async close(): Promise<void> {
    await this.producer.close()
  }
}

export class KafkaConsumer implements MessagingConsumer {
  private consumer: Consumer<string, string, string, string> | null = null
  private stream: Readable | null = null
  private running = false
  private readonly config: KafkaConsumerConfig

  constructor(config: KafkaConsumerConfig) {
    this.config = config
  }

  async consume(handler: (payload: string) => Promise<void>): Promise<void> {
    const clientId = this.config.clientId || "sequence-dispatch-consumer"
    const groupId = this.config.groupId || "sequence-dispatch-consumer"
    const partitions =
      this.config.partitions ?? DEFAULT_KAFKA_CONSUMER_CONFIG.partitions
    const replicationFactor =
      this.config.replicationFactor ??
      DEFAULT_KAFKA_CONSUMER_CONFIG.replicationFactor
    const sessionTimeout =
      this.config.sessionTimeout ?? DEFAULT_KAFKA_CONSUMER_CONFIG.sessionTimeout
    const heartbeatInterval =
      this.config.heartbeatInterval ??
      DEFAULT_KAFKA_CONSUMER_CONFIG.heartbeatInterval

    this.consumer = createConsumer(clientId, groupId)

    await ensureTopicExists(
      clientId,
      this.config.topic,
      partitions,
      replicationFactor,
    )

    this.stream = await this.consumer.consume({
      topics: [this.config.topic],
      autocommit: true,
      sessionTimeout,
      heartbeatInterval,
    })

    this.running = true

    for await (const message of this.stream) {
      if (!this.running) {
        break
      }

      if (message.value) {
        try {
          await handler(message.value)
        } catch (error) {
          console.error("[Kafka] Error processing message:", error)
        }
      }
    }

    this.stream = null
  }

  isRunning(): boolean {
    return this.running
  }

  async close(): Promise<void> {
    this.running = false

    if (this.stream) {
      this.stream.destroy()
      this.stream = null
    }

    if (this.consumer) {
      await this.consumer.close()
      this.consumer = null
    }
  }
}
