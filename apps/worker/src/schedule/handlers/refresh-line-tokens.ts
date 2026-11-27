import { lineIntegrationService } from "@chatbotx.io/business"
import type { LineAuthValue } from "@chatbotx.io/integration-line"
import { AuthException } from "@chatbotx.io/sdk"
import { integrations } from "../../services/integrations"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 60
// LINE short-lived channel access tokens last 30 days; refresh the ones that
// expire within 3 days so a few missed daily runs never let one lapse.
const REFRESH_WITHIN_MS = 3 * 24 * 60 * 60 * 1000

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  await refreshWithErrorHandling<LineAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "line",
    label: "refreshLineTokens",
    lockKey: `auth:refresh:line:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    refresh: async () => {
      const current = await lineIntegrationService.findById({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      return await integrations.line.refreshAuth?.({
        auth: current.auth as LineAuthValue,
      })
    },
    apply: (newAuth) =>
      lineIntegrationService.updateAuth({
        id: integration.id,
        workspaceId: integration.workspaceId,
        auth: newAuth,
      }),
    markError: (error) =>
      lineIntegrationService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: error instanceof AuthException,
      }),
    auditDetail: "auto-refreshed the LINE channel access token",
  })
}

export async function refreshLineTokens(): Promise<void> {
  const due = await lineIntegrationService.findDueForRefresh(REFRESH_WITHIN_MS)

  await runRefreshBatch(due, refreshOne, BATCH_SIZE)
}
