import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const flowQueue = new Queue(QueueName.FLOW, {
  connection: getRedisConnection(),
  defaultJobOptions,
})
