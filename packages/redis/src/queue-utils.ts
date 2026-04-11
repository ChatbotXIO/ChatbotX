import { distributedStore } from "."

export const simpleQueue = {
  enqueue: async (queueName: string, value: unknown, ttlSeconds: number) => {
    // Add value to queue
    await distributedStore.rpush(queueName, value)

    // Set TTL to auto-expire
    await distributedStore.expire(queueName, ttlSeconds)
  },

  getAll: async (queueName: string) => {
    // Get all messages (they're stored in reverse order)
    return await distributedStore.lrange(queueName, 0, -1)
  },

  clear: async (queueName: string) => {
    await distributedStore.delete(queueName)
  },
}
