import { Counter, collectDefaultMetrics, Gauge, Registry } from "prom-client"

export type ErrorClass = "code_bug" | "db_transient" | "third_party" | "unknown"
export type MessageDirection = "in" | "out"

type QueueMetrics = {
  failed: number
  oldestWaitingSeconds: number
  queue: string
  waiting: number
}

type QueueMetricsCollector = () => Promise<QueueMetrics[]>

export const metricsRegistry = new Registry()

collectDefaultMetrics({
  prefix: "chatbotx_",
  register: metricsRegistry,
})

const messagesTotal = new Counter<"channel" | "direction">({
  name: "chatbotx_messages_total",
  help: "Persisted messages by direction and channel.",
  labelNames: ["direction", "channel"],
  registers: [metricsRegistry],
})

const jobsCompletedTotal = new Counter<"job" | "queue">({
  name: "chatbotx_jobs_completed_total",
  help: "Completed BullMQ jobs by queue and job name.",
  labelNames: ["queue", "job"],
  registers: [metricsRegistry],
})

const jobsFailedTotal = new Counter<"error_class" | "job" | "queue">({
  name: "chatbotx_jobs_failed_total",
  help: "Failed BullMQ jobs by queue, job name, and bounded error class.",
  labelNames: ["queue", "job", "error_class"],
  registers: [metricsRegistry],
})

const sideEffectFailedTotal = new Counter<"name">({
  name: "chatbotx_side_effect_failed_total",
  help: "Failed non-critical side effects that did not abort the primary operation.",
  labelNames: ["name"],
  registers: [metricsRegistry],
})

let queueWaiting: Gauge<"queue">
let queueOldestWaitingSeconds: Gauge<"queue">
let queueFailed: Gauge<"queue">
let collectQueueMetrics: QueueMetricsCollector | undefined
let queueMetricsRefresh: Promise<void> | undefined

const refreshQueueMetrics = async (): Promise<void> => {
  if (!collectQueueMetrics) {
    return
  }
  if (queueMetricsRefresh) {
    return await queueMetricsRefresh
  }

  queueMetricsRefresh = (async () => {
    const metrics = await collectQueueMetrics?.()
    queueWaiting.reset()
    queueOldestWaitingSeconds.reset()
    queueFailed.reset()

    for (const metric of metrics ?? []) {
      queueWaiting.set({ queue: metric.queue }, metric.waiting)
      queueOldestWaitingSeconds.set(
        { queue: metric.queue },
        metric.oldestWaitingSeconds,
      )
      queueFailed.set({ queue: metric.queue }, metric.failed)
    }
  })()

  try {
    await queueMetricsRefresh
  } finally {
    queueMetricsRefresh = undefined
  }
}

queueWaiting = new Gauge<"queue">({
  name: "chatbotx_queue_waiting",
  help: "BullMQ jobs waiting to be processed.",
  labelNames: ["queue"],
  registers: [metricsRegistry],
  collect: refreshQueueMetrics,
})

queueOldestWaitingSeconds = new Gauge<"queue">({
  name: "chatbotx_queue_oldest_waiting_seconds",
  help: "Age in seconds of the oldest waiting BullMQ job.",
  labelNames: ["queue"],
  registers: [metricsRegistry],
  collect: refreshQueueMetrics,
})

queueFailed = new Gauge<"queue">({
  name: "chatbotx_queue_failed",
  help: "BullMQ jobs retained in the failed state.",
  labelNames: ["queue"],
  registers: [metricsRegistry],
  collect: refreshQueueMetrics,
})

export const registerQueueMetricsCollector = (
  collector: QueueMetricsCollector,
): void => {
  collectQueueMetrics = collector
}

export const incrementMessage = (input: {
  channel: string
  direction: MessageDirection
}): void => {
  messagesTotal.inc(input)
}

export const incrementJobCompleted = (input: {
  job: string
  queue: string
}): void => {
  jobsCompletedTotal.inc(input)
}

export const incrementJobFailed = (input: {
  errorClass: ErrorClass
  job: string
  queue: string
}): void => {
  jobsFailedTotal.inc({
    queue: input.queue,
    job: input.job,
    error_class: input.errorClass,
  })
}

export const incrementSideEffectFailed = (name: string): void => {
  sideEffectFailedTotal.inc({ name })
}

export const getMetrics = async (): Promise<string> =>
  await metricsRegistry.metrics()
export const getMetricsContentType = (): string => metricsRegistry.contentType
