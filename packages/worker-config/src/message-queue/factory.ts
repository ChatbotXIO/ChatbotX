import { BullMQConsumer, BullMQProducer } from "./bullmq-provider"
import type {
  ConsumerConfig,
  KafkaConsumerConfig,
  MessagingConsumer,
  MessagingProducer,
  ProducerConfig,
  ProviderType,
} from "./types"
import { providerTypes } from "./types"

const getProviderType = (): ProviderType => {
  const provider = process.env.MESSAGING_PROVIDER as ProviderType | undefined
  return provider && providerTypes.safeParse(provider).success
    ? provider
    : "bullmq"
}

export function createProducer(config: ProducerConfig): MessagingProducer {
  const type = getProviderType()

  switch (type) {
    case "bullmq":
      return new BullMQProducer(config)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

export function createConsumer(
  config: ConsumerConfig | KafkaConsumerConfig,
): MessagingConsumer {
  const type = getProviderType()

  switch (type) {
    case "bullmq":
      return new BullMQConsumer(config as ConsumerConfig)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}
