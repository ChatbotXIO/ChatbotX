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

export async function createProducer(
  config: ProducerConfig,
): Promise<MessagingProducer> {
  const type = getProviderType()

  switch (type) {
    case "bullmq":
      return new BullMQProducer(config)
    case "kafka": {
      const { KafkaProducer } = await import("./kafka-provider")
      return new KafkaProducer(config)
    }
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

export async function createConsumer(
  config: ConsumerConfig | KafkaConsumerConfig,
): Promise<MessagingConsumer> {
  const type = getProviderType()

  switch (type) {
    case "bullmq":
      return new BullMQConsumer(config as ConsumerConfig)
    case "kafka": {
      const { KafkaConsumer } = await import("./kafka-provider")
      return new KafkaConsumer(config as KafkaConsumerConfig)
    }
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}
