import { Admin } from "@platformatic/kafka"
import { keys } from "./keys"

export const createAdmin = (clientId: string) => {
  const env = keys()
  const brokers = env.KAFKA_BROKERS.split(",")

  const sasl =
    env.KAFKA_SASL_USERNAME && env.KAFKA_SASL_PASSWORD
      ? {
          mechanism: "PLAIN" as const,
          username: env.KAFKA_SASL_USERNAME,
          password: env.KAFKA_SASL_PASSWORD,
        }
      : undefined

  return new Admin({
    clientId,
    bootstrapBrokers: brokers,
    sasl,
  })
}

export async function ensureTopicExists(
  clientId: string,
  topic: string,
  partitions = 1,
  replicationFactor = 1,
): Promise<void> {
  const admin = createAdmin(clientId)
  try {
    try {
      const metadata = await admin.metadata({ topics: [topic] })
      if (metadata.topics.has(topic)) {
        return
      }
    } catch {
      // Topic does not exist, continue to create it
    }

    await admin.createTopics({
      topics: [topic],
      partitions,
      replicas: replicationFactor,
    })
  } catch {
    // Ignore if topic already exists
  } finally {
    await admin.close()
  }
}
