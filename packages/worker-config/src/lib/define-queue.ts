import { Queue, type QueueOptions } from "bullmq"
import { defaultJobOptions, fakeQueue, getRedisConnection } from "./connection"
import type { queueNames } from "./types"

type QueueName = (typeof queueNames.enum)[keyof typeof queueNames.enum]

export function defineQueue<T>(
  name: QueueName,
  options?: Omit<QueueOptions, "connection">,
): Queue<T> | typeof fakeQueue {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return fakeQueue
  }
  return new Queue<T>(name, {
    connection: getRedisConnection(),
    defaultJobOptions,
    ...options,
  })
}
