import { Producer, stringSerializers } from "@platformatic/kafka"
import { keys } from "./keys"

export const createProducer = (
  clientId: string,
): Producer<string, string, string, string> => {
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

  return new Producer({
    clientId,
    bootstrapBrokers: brokers,
    serializers: stringSerializers,
    sasl,
  })
}
