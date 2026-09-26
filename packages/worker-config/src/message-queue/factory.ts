import { BullMQConsumer, BullMQProducer } from "./bullmq-provider"
import type {
  ConsumerConfig,
  MessagingConsumer,
  MessagingProducer,
  ProducerConfig,
} from "./types"

export function createProducer(config: ProducerConfig): MessagingProducer {
  return new BullMQProducer(config)
}

export function createConsumer(config: ConsumerConfig): MessagingConsumer {
  return new BullMQConsumer(config)
}
