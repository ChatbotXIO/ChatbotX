import { sequenceConnections } from "@chatbotx.io/redis"
import { Queue, Worker } from "bullmq"
import { defaultJobOptions } from "../lib/connection"
import {
  type ConsumerConfig,
  DEFAULT_CONSUMER_CONFIG,
  type MessagePayload,
  type MessagingConsumer,
  type MessagingProducer,
  type ProducerConfig,
} from "./types"

export class BullMQProducer implements MessagingProducer {
  private queue: Queue | null = null
  private readonly queueName: string

  constructor(config: ProducerConfig) {
    this.queueName = config.topic
  }

  private async getQueue(): Promise<Queue> {
    if (this.queue) {
      return this.queue
    }

    const connection = await sequenceConnections.useExisting()
    this.queue = new Queue(this.queueName, {
      connection,
      defaultJobOptions,
    })

    return this.queue
  }

  async send(messages: MessagePayload[]): Promise<void> {
    const queue = await this.getQueue()

    const jobs = messages.map((msg) => ({
      name: msg.key,
      data: { key: msg.key, value: msg.value },
    }))

    await queue.addBulk(jobs)
  }

  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close()
      this.queue = null
    }
  }
}

export class BullMQConsumer implements MessagingConsumer {
  private worker: Worker | null = null
  private running = false
  private readonly queueName: string
  private readonly config: ConsumerConfig

  constructor(config: ConsumerConfig) {
    this.queueName = config.topic
    this.config = config
  }

  async consume(handler: (payload: string) => Promise<void>): Promise<void> {
    const connection = await sequenceConnections.useExisting()

    const concurrency =
      this.config.concurrency ?? DEFAULT_CONSUMER_CONFIG.concurrency
    const removeOnComplete =
      this.config.removeOnComplete ?? DEFAULT_CONSUMER_CONFIG.removeOnComplete
    const removeOnFail =
      this.config.removeOnFail ?? DEFAULT_CONSUMER_CONFIG.removeOnFail

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        await handler(job.data.value)
      },
      {
        connection,
        concurrency,
        removeOnComplete: { count: removeOnComplete },
        removeOnFail: { count: removeOnFail },
      },
    )

    this.worker.on("failed", (job, err) => {
      console.error(`[BullMQ] Job ${job?.id} failed:`, err)
    })

    await this.worker.waitUntilReady()
    this.running = true
  }

  isRunning(): boolean {
    return this.running
  }

  async close(): Promise<void> {
    this.running = false

    if (this.worker) {
      await this.worker.close()
      this.worker = null
    }
  }
}
