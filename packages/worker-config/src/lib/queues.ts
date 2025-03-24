import { Queue } from "bullmq"
import { QueueName } from "../schemas"
import { connection, defaultJobOptions } from "./connection"

const integrationQueue = new Queue(QueueName.INTEGRATION, {
  connection,
  defaultJobOptions,
})

const chatQueue = new Queue(QueueName.CHAT, {
  connection,
  defaultJobOptions,
})

export { integrationQueue, chatQueue }
