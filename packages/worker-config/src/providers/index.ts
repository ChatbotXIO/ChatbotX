import { BullMQConsumer, BullMQProducer } from "./bullmq-provider"
import { KafkaConsumer, KafkaProducer } from "./kafka-provider"
import {
  type ConsumerConfig,
  type KafkaConsumerConfig,
  type MessagingConsumer,
  type MessagingProducer,
  type ProducerConfig,
  type ProviderType,
  providerTypes,
} from "./types"

export type {
  ConsumerConfig,
  KafkaConsumerConfig,
  MessagePayload,
  MessagingConsumer,
  MessagingProducer,
  ProducerConfig,
  ProviderType,
} from "./types"

export {
  ConsumerConfigSchema,
  DEFAULT_CONSUMER_CONFIG,
  DEFAULT_KAFKA_CONSUMER_CONFIG,
  KafkaConsumerConfigSchema,
  MessagePayloadSchema,
  ProducerConfigSchema,
  providerTypes,
} from "./types"

export function createMessagingProducer(
  type: ProviderType,
  config: ProducerConfig,
): MessagingProducer {
  switch (type) {
    case providerTypes.enum.bullmq:
      return new BullMQProducer(config)
    case providerTypes.enum.kafka:
      return new KafkaProducer(config)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

type ConsumerConfigMap = {
  bullmq: ConsumerConfig
  kafka: KafkaConsumerConfig
}

export function createMessagingConsumer<T extends ProviderType>(
  type: T,
  config: ConsumerConfigMap[T],
): MessagingConsumer {
  switch (type) {
    case providerTypes.enum.bullmq:
      return new BullMQConsumer(config as ConsumerConfig)
    case providerTypes.enum.kafka:
      return new KafkaConsumer(config as KafkaConsumerConfig)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}
