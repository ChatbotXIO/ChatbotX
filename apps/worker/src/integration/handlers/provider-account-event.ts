import {
  integrationWhatsappService,
  type ProviderAccountEventRequest,
  providerAccountEventService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import {
  PROVIDER_ACCOUNT_TARGET_BATCH_SIZE,
  type ProviderAccountRouteScope,
  type ProviderAccountTarget,
} from "@chatbotx.io/database/partials"
import type { IntegrationJobProviderAccountEvent } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

type ProviderAccountEventData = IntegrationJobProviderAccountEvent["data"]

type AccountTargetBatchLoader = (input: {
  accountId: string
  scope: ProviderAccountRouteScope
  afterIntegrationId?: string
}) => Promise<ProviderAccountTarget[]>

/** One loader per integration type: how a provider account id maps to our channel numbers. */
const ACCOUNT_TARGET_LOADERS: Partial<
  Record<ProviderAccountEventData["integrationType"], AccountTargetBatchLoader>
> = {
  whatsapp: ({ accountId, scope, afterIntegrationId }) =>
    integrationWhatsappService.listAccountTargets({
      wabaId: accountId,
      scope,
      afterIntegrationId,
    }),
}

/**
 * Walks every batch of targets for the account, so an account with more
 * numbers than one batch is never left partly updated. Re-running a batch is
 * safe: each connection resolves a repeated event as a duplicate.
 */
async function* targetBatches(
  loadBatch: AccountTargetBatchLoader,
  input: { accountId: string; scope: ProviderAccountRouteScope },
): AsyncGenerator<ProviderAccountTarget[]> {
  let afterIntegrationId: string | undefined
  while (true) {
    const batch = await loadBatch({ ...input, afterIntegrationId })
    if (batch.length > 0) {
      yield batch
    }
    if (batch.length < PROVIDER_ACCOUNT_TARGET_BATCH_SIZE) {
      return
    }
    afterIntegrationId = batch.at(-1)?.integrationId
  }
}

export const handleProviderAccountEvent = async (
  data: ProviderAccountEventData,
): Promise<void> => {
  if (!data.routeScope) {
    logger.error(
      { integrationType: data.integrationType, event: data.event },
      "Provider account event dropped: job carries no route scope",
    )
    return
  }
  const loadBatch = ACCOUNT_TARGET_LOADERS[data.integrationType]
  if (!loadBatch) {
    logger.warn(
      { integrationType: data.integrationType },
      "Provider account event dropped: integration type has no target loader",
    )
    return
  }

  const request: ProviderAccountEventRequest = {
    integrationType: data.integrationType,
    event: data.event,
    detail: data.detail,
    occurredAt: new Date(data.occurredAt),
  }
  let handled = 0
  for await (const batch of targetBatches(loadBatch, {
    accountId: data.account.id,
    scope: data.routeScope,
  })) {
    for (const target of batch) {
      await applyInWorkspaceContext(request, target)
      handled += 1
    }
  }

  logger.info(
    {
      integrationType: data.integrationType,
      accountId: data.account.id,
      event: data.event,
      targets: handled,
    },
    "Provider account event handled",
  )
}

const applyInWorkspaceContext = (
  request: ProviderAccountEventRequest,
  target: ProviderAccountTarget,
) =>
  withBlockedOwnerGuard(target.workspaceId, () =>
    runJobWithAuditContext(
      {
        workspaceId: target.workspaceId,
        source: "integration:providerAccountEvent",
      },
      () => providerAccountEventService.applyToTarget({ request, target }),
    ),
  )
