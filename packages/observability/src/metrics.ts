import { Counter, collectDefaultMetrics, Gauge, Registry } from "prom-client"

export type ErrorClass = "code_bug" | "db_transient" | "third_party" | "unknown"

type MessageDirection = "in" | "out"

type QueueMetrics = {
  failed: number
  oldestWaitingSeconds: number
  queue: string
  waiting: number
}

type QueueMetricsCollector = () => Promise<QueueMetrics[]>

type MetricsState = {
  collectQueueMetrics: QueueMetricsCollector | undefined
  defaultMetricsCollected: boolean
  jobsCompletedTotal: Counter<"job" | "queue">
  jobsFailedTotal: Counter<"error_class" | "job" | "queue">
  messagesTotal: Counter<"channel" | "direction">
  queueFailed: Gauge<"queue">
  queueMetricsRefresh: Promise<void> | undefined
  queueOldestWaitingSeconds: Gauge<"queue">
  queueWaiting: Gauge<"queue">
  registry: Registry
  sideEffectFailedTotal: Counter<"name">
}

const OBSERVABILITY_STATE_KEY = Symbol.for("chatbotx.observability")

function refreshQueueMetrics(): Promise<void> {
  const collector = metricsState.collectQueueMetrics
  if (!collector) {
    return Promise.resolve()
  }
  if (metricsState.queueMetricsRefresh) {
    return metricsState.queueMetricsRefresh
  }

  metricsState.queueMetricsRefresh = (async () => {
    const metrics = await collector()
    metricsState.queueWaiting.reset()
    metricsState.queueOldestWaitingSeconds.reset()
    metricsState.queueFailed.reset()

    for (const metric of metrics) {
      metricsState.queueWaiting.set({ queue: metric.queue }, metric.waiting)
      metricsState.queueOldestWaitingSeconds.set(
        { queue: metric.queue },
        metric.oldestWaitingSeconds,
      )
      metricsState.queueFailed.set({ queue: metric.queue }, metric.failed)
    }
  })()

  return metricsState.queueMetricsRefresh.finally(() => {
    metricsState.queueMetricsRefresh = undefined
  })
}

const createMetricsState = (): MetricsState => {
  const registry = new Registry()

  return {
    collectQueueMetrics: undefined,
    defaultMetricsCollected: false,
    messagesTotal: new Counter<"channel" | "direction">({
      name: "chatbotx_messages_total",
      help: "Persisted messages by direction and channel.",
      labelNames: ["direction", "channel"],
      registers: [registry],
    }),
    jobsCompletedTotal: new Counter<"job" | "queue">({
      name: "chatbotx_jobs_completed_total",
      help: "Completed BullMQ jobs by queue and job name.",
      labelNames: ["queue", "job"],
      registers: [registry],
    }),
    jobsFailedTotal: new Counter<"error_class" | "job" | "queue">({
      name: "chatbotx_jobs_failed_total",
      help: "Failed BullMQ jobs by queue, job name, and bounded error class.",
      labelNames: ["queue", "job", "error_class"],
      registers: [registry],
    }),
    sideEffectFailedTotal: new Counter<"name">({
      name: "chatbotx_side_effect_failed_total",
      help: "Failed non-critical side effects that did not abort the primary operation.",
      labelNames: ["name"],
      registers: [registry],
    }),
    queueWaiting: new Gauge<"queue">({
      name: "chatbotx_queue_waiting",
      help: "BullMQ jobs waiting to be processed.",
      labelNames: ["queue"],
      registers: [registry],
      collect: refreshQueueMetrics,
    }),
    queueOldestWaitingSeconds: new Gauge<"queue">({
      name: "chatbotx_queue_oldest_waiting_seconds",
      help: "Age in seconds of the oldest waiting BullMQ job.",
      labelNames: ["queue"],
      registers: [registry],
      collect: refreshQueueMetrics,
    }),
    queueFailed: new Gauge<"queue">({
      name: "chatbotx_queue_failed",
      help: "BullMQ jobs retained in the failed state.",
      labelNames: ["queue"],
      registers: [registry],
      collect: refreshQueueMetrics,
    }),
    queueMetricsRefresh: undefined,
    registry,
  }
}

const globalState = globalThis as typeof globalThis & {
  [key: symbol]: MetricsState | undefined
}

const existingMetricsState = globalState[OBSERVABILITY_STATE_KEY]
let metricsState: MetricsState
if (existingMetricsState) {
  metricsState = existingMetricsState
} else {
  metricsState = createMetricsState()
  globalState[OBSERVABILITY_STATE_KEY] = metricsState
}

export const ensureDefaultMetrics = (): void => {
  if (metricsState.defaultMetricsCollected) {
    return
  }

  collectDefaultMetrics({
    prefix: "chatbotx_",
    register: metricsState.registry,
  })
  metricsState.defaultMetricsCollected = true
}

export const registerQueueMetricsCollector = (
  collector: QueueMetricsCollector,
): void => {
  metricsState.collectQueueMetrics = collector
}

export const incrementMessage = (input: {
  channel: string
  direction: MessageDirection
}): void => {
  metricsState.messagesTotal.inc(input)
}

export const incrementJobCompleted = (input: {
  job: string
  queue: string
}): void => {
  metricsState.jobsCompletedTotal.inc(input)
}

export const incrementJobFailed = (input: {
  errorClass: ErrorClass
  job: string
  queue: string
}): void => {
  metricsState.jobsFailedTotal.inc({
    queue: input.queue,
    job: input.job,
    error_class: input.errorClass,
  })
}

export const incrementSideEffectFailed = (name: string): void => {
  metricsState.sideEffectFailedTotal.inc({ name })
}

export const getMetrics = async (): Promise<string> =>
  await metricsState.registry.metrics()
export const getMetricsContentType = (): string =>
  metricsState.registry.contentType
