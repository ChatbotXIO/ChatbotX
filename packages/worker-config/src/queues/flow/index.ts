import { Queue } from "bullmq"
import { QueueName } from "../../lib/types"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"

export const flowQueue = new Queue(QueueName.FLOW, {
  connection: getRedisConnection(),
  defaultJobOptions,
})
