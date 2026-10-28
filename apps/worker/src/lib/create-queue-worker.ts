import {
  defaultWorkerOptions,
  getQueueConnection,
  type QueueName,
} from "@chatbotx.io/worker-config"
import { type Job, type Processor, Worker, type WorkerOptions } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "./logger"
import { onShutdown } from "./shutdown"

type QueueWorkerOptions<TData> = Omit<WorkerOptions, "connection"> & {
  /** Replaces the default `failed` logger (e.g. to mark a job's side effects). */
  onFailed?: (job: Job<TData> | undefined, err: Error) => void
}

/**
 * Builds a BullMQ consumer with the shared defaults and listeners:
 * - `error` is always handled. An unhandled Worker `error` is rethrown by the
 *   EventEmitter, becomes `uncaughtException` and restarts every queue in a
 *   consolidated process, so a Redis blip must only be logged.
 * - `failed` is logged unless the caller supplies `onFailed`.
 * - The worker is drained on shutdown under the queue's own name.
 * Caller options win over `defaultWorkerOptions`.
 */
export function createQueueWorker<TData>(
  queue: QueueName,
  processor: Processor<TData>,
  { onFailed, ...options }: QueueWorkerOptions<TData> = {},
): Worker<TData> {
  const worker = new Worker<TData>(queue, processor, {
    connection: getQueueConnection(queue),
    ...defaultWorkerOptions,
    ...options,
  })

  worker.on("error", (err) => {
    logger.error({ err: normalizeError(err), queue }, "Queue worker error")
  })
  worker.on(
    "failed",
    onFailed ??
      ((job, err) => {
        if (job) {
          logger.error(
            { err: normalizeError(err), queue, jobId: job.id },
            "Job has failed",
          )
        }
      }),
  )

  onShutdown(queue, () => worker.close())
  return worker
}
