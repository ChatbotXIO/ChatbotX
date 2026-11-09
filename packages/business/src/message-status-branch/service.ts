import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "../logger"

/**
 * How long after a send its delivery status is still kept with live traffic.
 * Providers report delivered/failed within minutes for almost every message;
 * a later status finds no marker and its branch still runs, from the `low`
 * queue. One key per branching send, so the window stays short to bound RAM.
 */
export const MESSAGE_STATUS_BRANCH_TTL_SECONDS = 24 * 60 * 60

type MessageStatusBranchKeyProps = {
  channel: string
  providerMessageId: string
}

type MessageStatusBranchMarkProps = MessageStatusBranchKeyProps & {
  /** The statuses of this message that run a flow branch. */
  statuses: readonly string[]
}

type MessageStatusBranchCheckProps = MessageStatusBranchKeyProps & {
  status: string
}

const messageStatusBranchKey = (props: MessageStatusBranchKeyProps): string =>
  `msg-status-branch:${props.channel}:${props.providerMessageId}`

/**
 * Remembers which statuses of a sent message run a branch that continues a
 * flow, so ingress can keep their status on the latency-sensitive queue while
 * every other status is routed as plain bookkeeping. Channel-agnostic: any
 * channel with a status-driven branch records and reads the same marker.
 *
 * Both calls are best-effort. A Redis error is logged and never thrown: a
 * missing marker only sends the status to the low queue, where the branch still
 * runs, just later.
 */
export const messageStatusBranchService = {
  async mark(props: MessageStatusBranchMarkProps): Promise<void> {
    try {
      await distributedStore.put(
        messageStatusBranchKey(props),
        props.statuses,
        MESSAGE_STATUS_BRANCH_TTL_SECONDS,
      )
    } catch (err) {
      logger.warn(
        {
          err,
          channel: props.channel,
          providerMessageId: props.providerMessageId,
        },
        "messageStatusBranchService.mark: Redis write failed",
      )
    }
  },

  /** Whether this status of this message runs a flow branch. */
  async continuesFlow(props: MessageStatusBranchCheckProps): Promise<boolean> {
    try {
      const statuses = await distributedStore.get<string[]>(
        messageStatusBranchKey(props),
      )
      return Array.isArray(statuses) && statuses.includes(props.status)
    } catch (err) {
      logger.warn(
        { err, ...props },
        "messageStatusBranchService.continuesFlow: Redis check failed, routing as bookkeeping",
      )
      return false
    }
  },
}
