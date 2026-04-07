import { keys as kafkaKeys } from "@chatbotx.io/kafka"

const kafkaEnv = kafkaKeys()

export const MAX_WAIT_TIME_IN_MS = 100
export const SESSION_TIMEOUT_IN_MS = 30_000
export const HEARTBEAT_INTERVAL_IN_MS = 3000
export const MAX_PROCESS = 100
export const MAX_RETRIES = 3
export const RETRY_BASE_DELAY_MS = 60_000
export const KAFKA_TOPIC = "seq.dispatch.run"
export const KAFKA_PARTITIONS = kafkaEnv.KAFKA_PARTITIONS
export const KAFKA_REPLICATION_FACTOR = kafkaEnv.KAFKA_REPLICATION_FACTOR
export const CONSUMER_CLIENT_ID = "sequence-dispatch-consumer"
export const CONSUMER_GROUP_ID = "sequence-dispatch-consumer"
