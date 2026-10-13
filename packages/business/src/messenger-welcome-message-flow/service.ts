import { messengerWelcomeMessageFlowRepository as repository } from "@chatbotx.io/database/repositories"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"

/** Collapse bursts of publish/rename clicks into one job per flow. */
const DEBOUNCE_MS = 5000

/**
 * The sync handler throws only when a page failed transiently (rate limit,
 * Meta 5xx, network), and a rerun is idempotent, so retry with backoff.
 */
const SYNC_ATTEMPTS = 3
const SYNC_BACKOFF_MS = 30_000

/**
 * Bookkeeping for the Meta welcome message flows mirrored from published
 * flows, plus the fire-and-forget enqueue helpers the flow services call.
 * Meta calls themselves live in the worker: this package cannot import
 * `@chatbotx.io/integration-messenger` (it depends on us).
 */
class MessengerWelcomeMessageFlowService {
  // Delegates resolve the repository at call time (not at construction), so
  // importing this module never touches the repositories barrel eagerly.
  findCurrent: (typeof repository)["findCurrent"] = (...args) =>
    repository.findCurrent(...args)
  listAllByFlow: (typeof repository)["listAllByFlow"] = (...args) =>
    repository.listAllByFlow(...args)
  insertCurrent: (typeof repository)["insertCurrent"] = (...args) =>
    repository.insertCurrent(...args)
  setFlowVersion: (typeof repository)["setFlowVersion"] = (...args) =>
    repository.setFlowVersion(...args)
  markSuperseded: (typeof repository)["markSuperseded"] = (...args) =>
    repository.markSuperseded(...args)
  replaceCurrent: (typeof repository)["replaceCurrent"] = (...args) =>
    repository.replaceCurrent(...args)
  deleteByIds: (typeof repository)["deleteByIds"] = (...args) =>
    repository.deleteByIds(...args)

  async listCurrentByFlow(input: {
    workspaceId: string
    flowId: string
  }): Promise<
    {
      integrationMessengerId: string
      pageId: string
      welcomeMessageFlowId: string
    }[]
  > {
    const rows = await repository.listCurrentByFlow(input)
    return rows.map((row) => ({
      integrationMessengerId: row.integrationMessengerId,
      pageId: row.pageId,
      welcomeMessageFlowId: row.metaFlowId,
    }))
  }

  /** Never throws: a queue outage must not fail publish or rename. */
  async enqueueSync(input: {
    workspaceId: string
    flowId: string
    reason: "publish" | "rename"
  }): Promise<void> {
    try {
      await defaultQueue.add(
        DefaultJobAction.syncWelcomeMessageFlows,
        { type: DefaultJobAction.syncWelcomeMessageFlows, data: input },
        {
          attempts: SYNC_ATTEMPTS,
          backoff: { type: "exponential", delay: SYNC_BACKOFF_MS },
          delay: DEBOUNCE_MS,
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: {
            id: `welcome-message-flow-${input.reason}-${input.flowId}`,
            ttl: DEBOUNCE_MS,
            extend: true,
            replace: true,
            // A publish arriving while the job is running is kept and run
            // right after it, instead of being dropped.
            keepLastIfActive: true,
          },
        },
      )
    } catch (error) {
      logger.warn(
        { err: error, flowId: input.flowId, reason: input.reason },
        "welcome message flow: failed to enqueue sync",
      )
    }
  }

  /** Never throws: a queue outage must not fail the flow delete. */
  async enqueueDelete(input: {
    workspaceId: string
    flowIds: string[]
  }): Promise<void> {
    if (input.flowIds.length === 0) {
      return
    }
    try {
      await defaultQueue.add(
        DefaultJobAction.deleteWelcomeMessageFlows,
        { type: DefaultJobAction.deleteWelcomeMessageFlows, data: input },
        { attempts: 1, removeOnComplete: true, removeOnFail: true },
      )
    } catch (error) {
      logger.warn(
        { err: error, flowIds: input.flowIds },
        "welcome message flow: failed to enqueue delete",
      )
    }
  }
}

export const messengerWelcomeMessageFlowService =
  new MessengerWelcomeMessageFlowService()
