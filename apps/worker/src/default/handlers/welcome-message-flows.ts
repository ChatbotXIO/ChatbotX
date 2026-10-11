import {
  flowService,
  flowVersionService,
  messengerWelcomeMessageFlowService as store,
} from "@chatbotx.io/business"
import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import {
  createWelcomeMessageFlow,
  deleteWelcomeMessageFlow,
  getWelcomeMessageFlow,
  isTransientWelcomeMessageFlowError,
  updateWelcomeMessageFlow,
} from "@chatbotx.io/integration-messenger/apis/welcome-message-flows"
import {
  convertStartNodeToMessengerAdsJson,
  type MessengerAdsMessage,
} from "@chatbotx.io/integration-messenger/messenger-ads"
import { distributedLock } from "@chatbotx.io/redis"
import {
  type JobDeleteWelcomeMessageFlows,
  type JobSyncWelcomeMessageFlows,
  welcomeMessageFlowLockKey,
} from "@chatbotx.io/worker-config"
import { groupBy } from "remeda"
import { logger } from "../../lib/logger"
import { buildMessengerContext } from "../../lib/messenger-context"

/** Long enough for N pages × a few Graph calls; jobs of one flow serialize. */
const LOCK_SECONDS = 120

/**
 * How long a job waits for the flow lock. The delete job runs once
 * (`attempts: 1`), so a lock-acquire timeout would orphan it; the holder's
 * lock auto-extends, so wait well past any realistic sync.
 */
const LOCK_WAIT_SECONDS = 900

export const formatWelcomeMessageFlowName = (name: string, version: number) =>
  `${name} (v${version})`

const withFlowLock = (flowId: string, fn: () => Promise<void>) =>
  distributedLock.runExclusive({
    key: welcomeMessageFlowLockKey(flowId),
    timeoutInSeconds: LOCK_SECONDS,
    retryTimeoutInSeconds: LOCK_WAIT_SECONDS,
    fn,
  })

/**
 * Mirrors a flow to Meta welcome message flows (Click-to-Messenger ads) on
 * every Messenger page of its workspace. Per-page failures are logged and
 * never stop the other pages; if any was transient (rate limit, Meta 5xx,
 * network) the job throws at the end so the queue retries it. A rerun is
 * safe: pages that already succeeded just update in place again.
 */
export async function syncWelcomeMessageFlows(
  data: JobSyncWelcomeMessageFlows["data"],
): Promise<void> {
  await withFlowLock(data.flowId, () => runSync(data))
}

async function runSync(
  data: JobSyncWelcomeMessageFlows["data"],
): Promise<void> {
  const { workspaceId, flowId, reason } = data
  // Re-read under the lock: the flow may have been deleted since enqueue.
  const flow = await flowService.findBy({ workspaceId, id: flowId })
  if (!flow) {
    return
  }

  const integrations = await integrationMessengerRepository.listByWorkspace({
    workspaceId,
  })
  if (integrations.length === 0) {
    return
  }

  // Resolved on first use, so a job with nothing to send to Meta (no current
  // row to rename, nothing to publish) never queries the version number.
  let name: Promise<string> | undefined
  const getName = () => {
    name ??= flowVersionService
      .publishedVersionNumber({ workspaceId, flowId })
      .then((version) => formatWelcomeMessageFlowName(flow.name, version))
    return name
  }

  const transientFailures: unknown[] = []
  const collect = (error: unknown) => {
    if (isTransientWelcomeMessageFlowError(error)) {
      transientFailures.push(error)
    }
  }

  if (reason === "rename") {
    for (const integration of integrations) {
      await renameOnPage({ workspaceId, flowId, getName, integration }).catch(
        collect,
      )
    }
    throwIfAny(transientFailures)
    return
  }

  // Uncached: a reader racing the publish may have re-cached the old version.
  const published = await flowVersionService.getMessengerAdsStartNode({
    flowId,
    workspaceId,
    fresh: true,
  })
  if (published.status === "notPublished") {
    return
  }
  const ok = published.status === "ok" ? published : null
  const flowVersionId = ok?.flowVersionId ?? null
  const messages = ok ? toMessages({ flowId, ...ok }) : []

  for (const integration of integrations) {
    await publishOnPage({
      workspaceId,
      flowId,
      flowVersionId,
      getName,
      messages,
      integration,
    }).catch(collect)
  }
  throwIfAny(transientFailures)
}

function throwIfAny(errors: unknown[]): void {
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "welcome message flow: transient failure, retrying",
    )
  }
}

function toMessages(props: {
  flowId: string
  flowVersionId: string
  startNode: unknown
}): MessengerAdsMessage[] {
  const { flowId, flowVersionId, startNode } = props
  const result = convertStartNodeToMessengerAdsJson({
    flowId,
    flowVersionId,
    startNode,
    mode: "lenient",
  })
  return result.status === "ok" ? result.messages : []
}

/** Logs and rethrows; `runSync` decides whether the failure is retryable. */
async function renameOnPage(props: {
  workspaceId: string
  flowId: string
  getName: () => Promise<string>
  integration: IntegrationMessengerModel
}): Promise<void> {
  const { workspaceId, flowId, getName, integration } = props
  try {
    const current = await store.findCurrent({
      flowId,
      integrationMessengerId: integration.id,
    })
    if (!current) {
      return
    }
    const ctx = await buildMessengerContext({ workspaceId, integration })
    await updateWelcomeMessageFlow({
      ctx,
      flowId: current.metaFlowId,
      name: await getName(),
    })
  } catch (error) {
    logger.warn(
      { err: error, flowId, pageId: integration.pageId },
      "welcome message flow: rename failed",
    )
    throw error
  }
}

/** Logs and rethrows; `runSync` decides whether the failure is retryable. */
async function publishOnPage(props: {
  workspaceId: string
  flowId: string
  flowVersionId: string | null
  getName: () => Promise<string>
  messages: MessengerAdsMessage[]
  integration: IntegrationMessengerModel
}): Promise<void> {
  const { workspaceId, flowId, flowVersionId, getName, messages, integration } =
    props
  const log = { flowId, pageId: integration.pageId }
  try {
    const current = await store.findCurrent({
      flowId,
      integrationMessengerId: integration.id,
    })

    if (messages.length === 0 || !flowVersionId) {
      if (current) {
        await removeCurrent({ workspaceId, integration, current, log })
      }
      return
    }

    const ctx = await buildMessengerContext({ workspaceId, integration })
    const name = await getName()

    // Decided here, written only once Meta accepted the new flow, so a failed
    // create leaves the old row current instead of leaving the page empty.
    let previous: { id: string; action: "supersede" | "delete" } | undefined
    if (current) {
      try {
        await updateWelcomeMessageFlow({
          ctx,
          flowId: current.metaFlowId,
          name,
          messages,
        })
        await store.setFlowVersion({ id: current.id, flowVersionId })
        return
      } catch (error) {
        // Meta documents no error code for "attached to an ad": ask it. A
        // failing lookup propagates and leaves the current row untouched.
        const state = await getWelcomeMessageFlow({
          ctx,
          flowId: current.metaFlowId,
        })
        if (state && !state.is_used_in_ad) {
          // Still editable, so the update failed for another reason
          // (transient or bad content): keep it current, never duplicate.
          throw error
        }
        // Used in an ad (Meta forbids updating it): keep it as superseded
        // for cleanup on flow delete. Gone from Meta: drop the stale row.
        previous = {
          id: current.id,
          action: state ? "supersede" : "delete",
        }
        logger.info(
          log,
          state
            ? "welcome message flow: used in an ad, creating a new one"
            : "welcome message flow: gone from Meta, creating a new one",
        )
      }
    }

    const { flowId: metaFlowId } = await createWelcomeMessageFlow({
      ctx,
      name,
      messages,
    })
    const next = {
      workspaceId,
      flowId,
      integrationMessengerId: integration.id,
      pageId: integration.pageId,
      metaFlowId,
      flowVersionId,
    }
    try {
      await (previous
        ? store.replaceCurrent({ previous, next })
        : store.insertCurrent(next))
    } catch (error) {
      // Meta has the flow but we failed to record it: delete it again (a
      // brand-new flow can't be in an ad yet) so it is never left untracked.
      await deleteWelcomeMessageFlow({ ctx, flowId: metaFlowId }).catch(
        (deleteError: unknown) =>
          logger.warn(
            { err: deleteError, ...log, metaFlowId },
            "welcome message flow: cleanup of unrecorded flow failed",
          ),
      )
      throw error
    }
  } catch (error) {
    logger.warn({ err: error, ...log }, "welcome message flow: sync failed")
    throw error
  }
}

/** Deletes the page's current Meta flow; keeps the row as superseded if Meta refuses. */
async function removeCurrent(props: {
  workspaceId: string
  integration: IntegrationMessengerModel
  current: { id: string; metaFlowId: string }
  log: Record<string, unknown>
}): Promise<void> {
  const { workspaceId, integration, current, log } = props
  try {
    const ctx = await buildMessengerContext({ workspaceId, integration })
    await deleteWelcomeMessageFlow({ ctx, flowId: current.metaFlowId })
    await store.deleteByIds({ ids: [current.id] })
  } catch (error) {
    logger.warn({ err: error, ...log }, "welcome message flow: delete failed")
    await store.markSuperseded({ id: current.id })
  }
}

/**
 * Best-effort DELETE of every Meta welcome message flow recorded for the
 * deleted flows. Rows are read under the per-flow lock so a create that raced
 * the delete is included. Rows whose DELETE fails (attached to an ad) stay.
 */
export async function deleteWelcomeMessageFlows(
  data: JobDeleteWelcomeMessageFlows["data"],
): Promise<void> {
  const { workspaceId } = data
  // Workspace-scoped, so a row pointing at another workspace's page is skipped.
  const integrations = new Map(
    (await integrationMessengerRepository.listByWorkspace({ workspaceId })).map(
      (integration) => [integration.id, integration],
    ),
  )
  for (const flowId of data.flowIds) {
    await withFlowLock(flowId, () =>
      deleteForFlow({ workspaceId, flowId, integrations }),
    )
  }
}

async function deleteForFlow(props: {
  workspaceId: string
  flowId: string
  integrations: Map<string, IntegrationMessengerModel>
}): Promise<void> {
  const { workspaceId, flowId, integrations } = props
  const rows = await store.listAllByFlow({ workspaceId, flowId })
  const deleted: string[] = []

  const byIntegration = groupBy(rows, (row) => row.integrationMessengerId)
  for (const [integrationMessengerId, pageRows] of Object.entries(
    byIntegration,
  )) {
    const integration = integrations.get(integrationMessengerId)
    if (!integration) {
      continue
    }
    try {
      const ctx = await buildMessengerContext({ workspaceId, integration })
      for (const row of pageRows) {
        try {
          await deleteWelcomeMessageFlow({ ctx, flowId: row.metaFlowId })
          deleted.push(row.id)
        } catch (error) {
          logger.warn(
            { err: error, flowId, metaFlowId: row.metaFlowId },
            "welcome message flow: delete failed",
          )
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, flowId, integrationMessengerId },
        "welcome message flow: delete skipped for page",
      )
    }
  }

  await store.deleteByIds({ ids: deleted })
}
