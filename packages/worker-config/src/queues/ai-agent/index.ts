import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const aiAgentQueue = new Queue(QueueName.AI_AGENT, {
  connection: getRedisConnection(),
  defaultJobOptions,
})
