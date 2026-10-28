import {
  defaultWorkerOptions,
  getQueueConnection,
  type QueueName,
} from "@chatbotx.io/worker-config"
import { type Job, type Processor, Worker, type WorkerOptions } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "./logger"
import { isShutdownRequested, onShutdown } from "./shutdown"

type QueueWorkerOptions<TData> = Omit<WorkerOptions, "connection"> & {
  /** Replaces the default `failed` logger (e.g. to mark a job's side effects). */
  onFailed?: (job: Job<TData> | undefined, err: Error) => void | Promise<void>
}

/**
 * Builds a BullMQ consumer with the shared defaults and listeners:
 * - `error` is always handled. An unhandled Worker `error` is rethrown by the
 *   EventEmitter, becomes `uncaughtException` and restarts every queue in a
 *   consolidated process, so a Redis blip must only be logged.
 * - `failed` is logged unless the caller supplies `onFailed`. BullMQ never
 *   awaits listeners, so a rejecting `onFailed` is caught and logged here;
 *   left alone it becomes `unhandledRejection` and drains every queue.
 * - The worker is drained on shutdown under the queue's own name.
 * Caller options win over `defaultWorkerOptions`. Throws once shutdown has
 * begun: a worker constructed then would consume jobs nothing ever closes.
 */
export function createQueueWorker<TData>(
  queue: QueueName,
  processor: Processor<TData>,
  { onFailed, ...options }: QueueWorkerOptions<TData> = {},
): Worker<TData> {
  if (isShutdownRequested()) {
    throw new Error(`Cannot start ${queue} worker: shutdown already requested`)
  }

  const worker = new Worker<TData>(queue, processor, {
    connection: getQueueConnection(queue),
    ...defaultWorkerOptions,
    ...options,
  })

  worker.on("error", (err) => {
    logger.error({ err: normalizeError(err), queue }, "Queue worker error")
  })
  worker.on("failed", (job, err): Promise<void> | undefined => {
    if (!onFailed) {
      if (job) {
        logger.error(
          { err: normalizeError(err), queue, jobId: job.id },
          "Job has failed",
        )
      }
      return
    }
    return Promise.resolve()
      .then(() => onFailed(job, err))
      .catch((handlerError: unknown) => {
        logger.error(
          { err: normalizeError(handlerError), queue, jobId: job?.id },
          "Failed-job handler threw",
        )
      })
  })

  onShutdown(queue, () => worker.close())
  return worker
}
