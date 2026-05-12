import {
  defaultWorkerOptions,
  getRedisConnection,
  type queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker, type WorkerOptions } from "bullmq"
import { ensureBootstrapped } from "./bootstrap"
import { logger } from "./logger"

type QueueName = (typeof queueNames.enum)[keyof typeof queueNames.enum]

type ActionEnvelope = { type: string; data: unknown }

export type HandlerMap<TJob extends ActionEnvelope> = {
  [K in TJob["type"]]: (
    data: Extract<TJob, { type: K }>["data"],
    job: Job<Extract<TJob, { type: K }>>,
  ) => unknown
}

export interface CreateWorkerOptions<TJob extends ActionEnvelope> {
  /** Run ensureBootstrapped() before starting the worker. Defaults to true. */
  bootstrap?: boolean
  /** Concurrency override. Defaults to defaultWorkerOptions.concurrency. */
  concurrency?: number
  /** Handler map keyed by discriminator. TS enforces total coverage. */
  handlers: HandlerMap<TJob>
  /** Pretty label for log lines and shutdown messages. Defaults to `name`. */
  label?: string
  /** When true, log every received job at info level. Defaults to false. */
  logJobReceipt?: boolean
  /** Queue name (typed against the queueNames enum). */
  name: QueueName
  /**
   * Optional tap invoked after the default `failed` log line. Used by the
   * `default` worker to re-enqueue an error-log job. Errors thrown inside the
   * tap are caught and logged separately so they don't crash the worker.
   */
  onFailed?: (job: Job<TJob> | undefined, err: Error) => Promise<void> | void
  /** Extra BullMQ WorkerOptions merged on top of the defaults. */
  workerOptions?: Partial<WorkerOptions>
}

export async function createBullMQWorker<TJob extends ActionEnvelope>(
  opts: CreateWorkerOptions<TJob>,
): Promise<Worker<TJob>> {
  const label = opts.label ?? opts.name

  if (opts.bootstrap !== false) {
    try {
      await ensureBootstrapped()
      logger.info(`${label} worker bootstrapped successfully`)
    } catch (err) {
      logger.error(err, `Failed to bootstrap ${label} worker`)
      process.exit(1)
    }
  }

  const worker = new Worker<TJob>(
    opts.name,
    async (job: Job<TJob>) => {
      if (opts.logJobReceipt) {
        logger.info(
          job.data as object,
          `Worker received job: ${job.id ?? "unknown"}`,
        )
      }

      const handler = opts.handlers[job.data.type as TJob["type"]] as
        | ((data: unknown, job: Job<TJob>) => Promise<void> | void)
        | undefined

      if (handler) {
        await handler(job.data.data, job)
        return
      }

      logger.warn(
        { jobId: job.id, type: job.data.type },
        `Unknown job type on ${label}`,
      )
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      ...(opts.concurrency === undefined
        ? {}
        : { concurrency: opts.concurrency }),
      ...opts.workerOptions,
    },
  )

  worker.on("failed", async (job, err) => {
    if (job) {
      logger.error(err, `${label} job ${job.id} has failed`)
    }
    if (opts.onFailed) {
      try {
        await opts.onFailed(job as Job<TJob> | undefined, err)
      } catch (tapErr) {
        logger.error(tapErr, `${label} onFailed tap threw for job ${job?.id}`)
      }
    }
  })

  registerShutdown(worker, label)

  return worker
}

function registerShutdown(worker: Worker, label: string): void {
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info(`${label} received ${signal}, closing worker...`)
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, `${label} error during shutdown`)
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}
