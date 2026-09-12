import { createId } from "@chatbotx.io/utils"
import {
  createQueueEvents,
  type FreeswitchApiCommand,
  freeswitchQueueName,
  getFreeswitchQueue,
  waitForJobResult,
} from "@chatbotx.io/worker-config"

const FREESWITCH_API_TIMEOUT_MS = 15_000

/** Thrown when the ESL `api` call reports failure (`-ERR ...` reply) or the BullMQ job itself failed (e.g. `freeswitch-esl-not-connected`). */
export class FreeswitchApiError extends Error {
  constructor(command: FreeswitchApiCommand, reply: string) {
    super(`freeswitch-api-error: ${command.kind} -> ${reply}`)
    this.name = "FreeswitchApiError"
  }
}

/** Thrown when the node's ESL-leader worker never returns a result in time. */
export class FreeswitchApiTimeoutError extends Error {
  constructor(command: FreeswitchApiCommand, nodeId: string) {
    super(
      `freeswitch-api-timeout: ${command.kind} on node "${nodeId}" did not complete in ${FREESWITCH_API_TIMEOUT_MS}ms`,
    )
    this.name = "FreeswitchApiTimeoutError"
  }
}

export type FreeswitchApiResult = { ok: boolean; reply: string }

/**
 * Synchronous ESL API contract: enqueues a `freeswitchApi` job on
 * the target node's dedicated queue (consumed only by that node's
 * ESL-leader `freeswitch` worker process) and blocks for the reply, the same
 * `job.add` + strict `waitForJobResult` pattern as
 * `waitForIntegrationJobCompletion`, but rejecting instead of swallowing —
 * callers (provisioning, `uuid_kill`) need the actual ESL reply, not
 * best-effort ordering.
 */
class FreeswitchApiClient {
  async run(
    nodeId: string,
    command: FreeswitchApiCommand,
  ): Promise<FreeswitchApiResult> {
    const requestId = createId()
    const queue = getFreeswitchQueue(nodeId)
    const job = await queue.add(
      "freeswitchApi",
      { type: "freeswitchApi", data: { requestId, command } },
      { jobId: requestId, attempts: 1, removeOnComplete: true },
    )

    let reply: string
    try {
      reply = await waitForJobResult(
        job as never,
        createQueueEvents(freeswitchQueueName(nodeId)),
        FREESWITCH_API_TIMEOUT_MS,
      )
    } catch (error) {
      // BullMQ's `waitUntilFinished` rejects with a "timed out" message on
      // timeout and with the job's `failedReason` (e.g. the ESL leader
      // threw `freeswitch-esl-not-connected`) for any other job failure —
      // an `-ERR` reply RESOLVES the job and is handled by the `!ok` check
      // below, so it never reaches this catch.
      if (error instanceof Error && error.message.includes("timed out")) {
        throw new FreeswitchApiTimeoutError(command, nodeId)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new FreeswitchApiError(command, message)
    }

    const ok = !reply.trimStart().startsWith("-ERR")
    if (!ok) {
      throw new FreeswitchApiError(command, reply)
    }
    return { ok, reply }
  }
}

export const freeswitchApiClient = new FreeswitchApiClient()
