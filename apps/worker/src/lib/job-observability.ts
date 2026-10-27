import {
  captureException,
  classifyError,
  incrementJobCompleted,
  incrementJobFailed,
} from "@chatbotx.io/observability"
import type { Worker } from "bullmq"

const trailingSlashes = /\/+$/

const bullBoardJobUrl = (queue: string, jobId: string | undefined) => {
  const baseUrl = process.env.BULL_BOARD_URL?.replace(trailingSlashes, "")
  if (!(baseUrl && jobId)) {
    return
  }

  return `${baseUrl}/queue/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}`
}

export const instrumentWorker = <DataType, ResultType, NameType extends string>(
  worker: Worker<DataType, ResultType, NameType>,
  input: { queue: string },
): void => {
  worker.on("completed", (job) => {
    incrementJobCompleted({
      queue: input.queue,
      job: job.name || "unnamed",
    })
  })

  worker.on("failed", (job, error) => {
    const errorClass = classifyError(error)
    const jobName = job?.name || "unknown"
    incrementJobFailed({
      queue: input.queue,
      job: jobName,
      errorClass,
    })
    const jobId = job?.id
    const bullboardUrl = bullBoardJobUrl(input.queue, jobId)
    captureException({
      error,
      queue: input.queue,
      job: jobName,
      errorClass,
      tags: { attemptsMade: job?.attemptsMade, jobId },
      ...(bullboardUrl ? { extra: { bullboardUrl } } : {}),
    })
  })
}
