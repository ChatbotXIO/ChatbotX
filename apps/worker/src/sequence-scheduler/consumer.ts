import { Consumer, stringDeserializers } from "@platformatic/kafka"
import { sequenceEnv } from "./keys"
import { SEQUENCE_KAFKA_CLENT_ID, SEQUENCE_KAFKA_GROUP_ID } from "./schema"

export const consumer = new Consumer({
  groupId: SEQUENCE_KAFKA_GROUP_ID,
  clientId: SEQUENCE_KAFKA_CLENT_ID,
  bootstrapBrokers: sequenceEnv.SEQUENCE_KAFKA_BROKERS,
  autocreateTopics: true,
  deserializers: stringDeserializers,
})
