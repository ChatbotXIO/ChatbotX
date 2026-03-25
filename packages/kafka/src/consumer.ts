import { Consumer, stringDeserializers } from "@platformatic/kafka"
import { keys } from "./keys"

export const createConsumer = (clientId: string, groupId: string) => {
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

  return new Consumer({
    clientId,
    groupId,
    bootstrapBrokers: brokers,
    deserializers: stringDeserializers,
    sasl,
  })
}
