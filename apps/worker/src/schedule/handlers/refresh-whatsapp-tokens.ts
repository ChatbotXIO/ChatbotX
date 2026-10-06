import {
  integrationWhatsappService,
  whatsappBusinessAccountService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  integration as integrationWhatsapp,
  isRevokedTokenError,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"
import {
  REFRESH_SOURCE,
  refreshWithErrorHandling,
  runRefreshBatch,
} from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationWhatsapp.refreshAuth) {
    return
  }

  await refreshWithErrorHandling<WhatsappAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "whatsapp",
    label: "refreshWhatsappTokens",
    lockKey: `auth:refresh:whatsapp:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    refresh: async () => {
      const current = await integrationWhatsappService.findByIdForWorkspace({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      if (!current) {
        return
      }

      const auth = current.auth as WhatsappAuthValue
      if (auth.metadata.isManual) {
        return
      }

      return (await integrationWhatsapp.refreshAuth?.({
        auth,
      })) as WhatsappAuthValue
    },
    apply: (newAuth) =>
      integrationWhatsappService.updateAuth({
        id: integration.id,
        workspaceId: integration.workspaceId,
        auth: newAuth,
      }),
    markError: (error) =>
      integrationWhatsappService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      }),
    auditDetail: "auto-refreshed the WhatsApp channel token",
  })
}

type RefreshableIntegration = {
  id: string
  workspaceId: string
  wabaId: string
  auth: WhatsappAuthValue
}

async function logWabaRefreshError(
  integration: RefreshableIntegration,
  error: unknown,
): Promise<void> {
  logger.error(
    error,
    `[refreshWhatsappTokens] wabaId=${integration.wabaId} failed`,
  )
  try {
    await logProviderError({
      provider: "whatsapp",
      workspaceId: integration.workspaceId,
      error,
    })
  } catch (loggingError) {
    logger.error(
      loggingError,
      `[refreshWhatsappTokens] wabaId=${integration.wabaId} error logging failed`,
    )
  }
}

async function refreshWabaCredential(
  integration: RefreshableIntegration,
): Promise<void> {
  try {
    await runJobWithAuditContext(
      { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
      () =>
        distributedLock.runExclusive({
          key: `auth:refresh:whatsapp:waba:${integration.workspaceId}:${integration.wabaId}`,
          timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
          fn: async () => {
            try {
              const waba =
                await whatsappBusinessAccountService.findDecryptedCredential({
                  workspaceId: integration.workspaceId,
                  wabaId: integration.wabaId,
                })
              // Legacy phone rows are intentionally not backfilled by this cron.
              if (!waba) {
                return
              }

              const current =
                await integrationWhatsappService.findByIdForWorkspace({
                  id: integration.id,
                  workspaceId: integration.workspaceId,
                })
              if (!current || current.wabaId !== integration.wabaId) {
                return
              }

              const auth = current.auth as WhatsappAuthValue
              if (auth.metadata.isManual) {
                return
              }
              const refreshedAuth = await integrationWhatsapp.refreshAuth?.({
                auth: {
                  ...auth,
                  tokens: {
                    ...auth.tokens,
                    accessToken: waba.decryptedCredential.accessToken,
                  },
                },
              })
              if (!refreshedAuth) {
                return
              }

              // CAS makes a refresh that loses to reconnect a safe no-op.
              const updated =
                await whatsappBusinessAccountService.upsertCredential({
                  workspaceId: integration.workspaceId,
                  wabaId: integration.wabaId,
                  businessId: waba.businessId,
                  credential: {
                    accessToken: refreshedAuth.tokens.accessToken,
                    apiVersion: waba.decryptedCredential.apiVersion,
                  },
                  grantedScopes: waba.grantedScopes,
                  scopeCheckedAt: waba.scopeCheckedAt ?? new Date(),
                  expectedRevision: waba.revision,
                })
              if (!updated) {
                return
              }

              await auditService.record({
                action: "refresh",
                detail:
                  "auto-refreshed the WhatsApp Business Account credential",
                workspaceId: integration.workspaceId,
                source: REFRESH_SOURCE,
              })
            } catch (error) {
              await logWabaRefreshError(integration, error)
            }
          },
        }),
    )
  } catch (error) {
    await logWabaRefreshError(integration, error)
  }
}

export async function refreshWhatsappTokens(): Promise<void> {
  if (!integrationWhatsapp.refreshAuth) {
    logger.warn("[refreshWhatsappTokens] integration does not support refresh")
    return
  }

  const integrations = await integrationWhatsappService.findAllForTokenRefresh()
  const wabaRefreshes = new Map<string, RefreshableIntegration>()

  for (const integration of integrations) {
    const auth = integration.auth as WhatsappAuthValue
    const key = `${integration.workspaceId}:${integration.wabaId}`
    if (!(auth.metadata.isManual || wabaRefreshes.has(key))) {
      wabaRefreshes.set(key, { ...integration, auth })
    }
  }

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)

  const wabaIntegrations = [...wabaRefreshes.values()]
  await runRefreshBatch(wabaIntegrations, refreshWabaCredential, BATCH_SIZE)
}
