import { Producer, stringSerializers } from "@platformatic/kafka"
import { sequenceEnv } from "./keys"
import { SEQUENCE_KAFKA_CLENT_ID } from "./schema"

export const producer = new Producer({
  clientId: SEQUENCE_KAFKA_CLENT_ID,
  bootstrapBrokers: sequenceEnv.SEQUENCE_KAFKA_BROKERS,
  autocreateTopics: true,
  serializers: stringSerializers,
})
