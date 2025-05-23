import { Queue } from "bullmq"
import { QueueName } from "../../lib/types"
import { connection, defaultJobOptions } from "../../lib/connection"

export const flowQueue = new Queue(QueueName.FLOW, {
  connection,
  defaultJobOptions,
})
