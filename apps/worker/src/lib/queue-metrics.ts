import { registerQueueMetricsCollector } from "@chatbotx.io/observability"
import { getQueueConnection, queueNames } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"

const observedQueues = [
  queueNames.enum.integration,
  queueNames.enum.chat,
  queueNames.enum.webhook,
  queueNames.enum.trigger,
  queueNames.enum.schedule,
  queueNames.enum.sequenceScheduler,
  queueNames.enum.callTranscription,
  queueNames.enum.whatsappVoipSignaling,
] as const

const queues = new Map<string, Queue>()

const getQueue = (name: (typeof observedQueues)[number]): Queue => {
  const existing = queues.get(name)
  if (existing) {
    return existing
  }

  const queue = new Queue(name, { connection: getQueueConnection(name) })
  queues.set(name, queue)
  return queue
}

export const registerWorkerQueueMetrics = (): void => {
  registerQueueMetricsCollector(
    async () =>
      await Promise.all(
        observedQueues.map(async (name) => {
          const queue = getQueue(name)
          const [counts, waiting] = await Promise.all([
            queue.getJobCounts("waiting", "failed"),
            queue.getWaiting(0, 0),
          ])
          const oldest = waiting[0]
          return {
            queue: name,
            waiting: counts.waiting ?? 0,
            failed: counts.failed ?? 0,
            oldestWaitingSeconds: oldest
              ? Math.max(0, (Date.now() - oldest.timestamp) / 1000)
              : 0,
          }
        }),
      ),
  )
}
