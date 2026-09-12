import type { FreeswitchApiJob } from "@chatbotx.io/worker-config"
import {
  freeswitchQueueName,
  getRedisConnection,
  renderFreeswitchApiCommand,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import type { EslConnection } from "./esl-connection"

const FREESWITCH_API_JOB_TIMEOUT_MS = 15_000

/**
 * Registers the node-scoped BullMQ consumer for the synchronous ESL API
 * contract — created only while this replica holds the ESL leader
 * lock, closed on loss. Runs `api <cmd>` over the live ESL connection and
 * returns the raw reply string as the job result; `freeswitchApiClient.run`
 * (business layer) reads it back via `waitForJobResult`.
 *
 * `-ERR` is deliberately NOT thrown here — the reply string (whatever it is)
 * is always the job's result; `freeswitchApiClient` classifies `-ERR` vs
 * success on the caller side. Only a timeout on the ESL command itself
 * (the connection is gone / FreeSWITCH is unresponsive) fails the job so
 * BullMQ's `attempts: 1` surfaces it as a rejection to the waiting caller.
 */
export const createFreeswitchApiConsumer = (
  nodeId: string,
  connection: EslConnection,
): Worker<FreeswitchApiJob["data"], string> =>
  new Worker<FreeswitchApiJob["data"], string>(
    freeswitchQueueName(nodeId),
    async (job: Job<FreeswitchApiJob["data"], string>) => {
      const command = renderFreeswitchApiCommand(job.data.command)
      return await runWithTimeout(
        connection.api(command),
        FREESWITCH_API_JOB_TIMEOUT_MS,
      )
    },
    { connection: getRedisConnection(), concurrency: 1 },
  )

const runWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("freeswitch-api-esl-timeout")),
        timeoutMs,
      )
      promise.then(resolve, reject)
    })
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
