"use server"

import {
  instagramIntegrationService,
  integrationWhatsappService,
  isWorkspaceScheduledForDeletion,
  messengerIntegrationService,
  tiktokIntegrationService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagram,
} from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import {
  integration as integrationMessenger,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken as refreshTiktokAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import {
  integration as integrationWhatsapp,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import {
  calculateExpiresAt,
  refreshAccessToken as refreshZaloAccessToken,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { distributedLock } from "@chatbotx.io/redis"
import { isCloud } from "@/env"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { authActionClient } from "@/lib/safe-action"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

type RefreshResult = "failed" | "refreshed" | "skipped"
type RefreshSummary = { refreshed: number; failed: number }

function toSummary(results: RefreshResult[]): RefreshSummary {
  return {
    refreshed: results.filter((result) => result === "refreshed").length,
    failed: results.filter((result) => result === "failed").length,
  }
}

const sumSummaries = (summaries: RefreshSummary[]): RefreshSummary =>
  summaries.reduce(
    (acc, summary) => ({
      refreshed: acc.refreshed + summary.refreshed,
      failed: acc.failed + summary.failed,
    }),
    { refreshed: 0, failed: 0 },
  )

async function runInBatches<T>(
  items: T[],
  worker: (item: T) => Promise<RefreshResult>,
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    results.push(...(await Promise.all(batch.map(worker))))
  }
  return results
}

async function refreshOneZalo(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  return await distributedLock.runExclusive({
    key: `auth:refresh:zalo:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration = await zaloIntegrationService.findById({
          id,
          workspaceId,
        })
        const auth = integration.auth as ZaloAuthValue
        if (!auth.tokens.refreshToken) {
          return "skipped"
        }

        const newTokens = await refreshZaloAccessToken(
          auth,
          auth.tokens.refreshToken,
        )
        await zaloIntegrationService.updateAuth(id, {
          ...auth,
          tokens: {
            ...auth.tokens,
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            expiresAt: calculateExpiresAt(newTokens.expires_in),
          },
        })
        return "refreshed"
      } catch (error) {
        await zaloIntegrationService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshZaloIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await zaloIntegrationService.findAllByWorkspaceIds(workspaceIds)
  const results = await runInBatches(integrations, (integration) =>
    refreshOneZalo(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

async function refreshOneTiktok(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  return await distributedLock.runExclusive({
    key: `auth:refresh:tiktok:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration = await tiktokIntegrationService.findById({
          id,
          workspaceId,
        })
        const auth = integration.auth as TiktokAuthValue
        if (!auth.tokens.refreshToken) {
          return "skipped"
        }

        const newTokens = await refreshTiktokAccessToken(
          { clientId: auth.clientId, clientSecret: auth.clientSecret },
          auth.tokens.refreshToken,
        )
        await tiktokIntegrationService.updateAuth(id, {
          ...auth,
          tokens: {
            ...auth.tokens,
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            ...buildTokenTimestamps(
              newTokens.expires_in,
              newTokens.refresh_expires_in,
            ),
          },
        })
        return "refreshed"
      } catch (error) {
        await tiktokIntegrationService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshTiktokIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await tiktokIntegrationService.findAllByWorkspaceIds(workspaceIds)
  const results = await runInBatches(integrations, (integration) =>
    refreshOneTiktok(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

async function refreshOneInstagram(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  if (!integrationInstagram.refreshAuth) {
    return "skipped"
  }

  return await distributedLock.runExclusive({
    key: `auth:refresh:instagram:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration =
          await instagramIntegrationService.findByIdForWorkspace({
            id,
            workspaceId,
          })
        if (!integration) {
          return "skipped"
        }

        const auth = integration.auth as InstagramAuthValue
        const newAuth = await integrationInstagram.refreshAuth?.({ auth })
        await instagramIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth as InstagramAuthValue,
        })
        return "refreshed"
      } catch (error) {
        await instagramIntegrationService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshInstagramIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await instagramIntegrationService.findForTokenRefreshByWorkspaceIds(
      workspaceIds,
    )
  const results = await runInBatches(integrations, (integration) =>
    refreshOneInstagram(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

async function refreshOneInstagramFacebook(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  if (!integrationInstagramFacebook.refreshAuth) {
    return "skipped"
  }

  return await distributedLock.runExclusive({
    key: `auth:refresh:instagramFacebook:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration =
          await instagramIntegrationService.findByIdForWorkspace({
            id,
            workspaceId,
          })
        if (!integration) {
          return "skipped"
        }

        const auth = integration.auth as InstagramAuthValue
        const newAuth = await integrationInstagramFacebook.refreshAuth?.({
          auth,
        })
        await instagramIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth as InstagramAuthValue,
        })
        return "refreshed"
      } catch (error) {
        await instagramIntegrationService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshInstagramFacebookIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await instagramIntegrationService.findFacebookForTokenRefreshByWorkspaceIds(
      workspaceIds,
    )
  const results = await runInBatches(integrations, (integration) =>
    refreshOneInstagramFacebook(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

async function refreshOneMessenger(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  if (!integrationMessenger.refreshAuth) {
    return "skipped"
  }

  return await distributedLock.runExclusive({
    key: `auth:refresh:messenger:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration =
          await messengerIntegrationService.findByIdForWorkspace({
            id,
            workspaceId,
          })
        if (!integration) {
          return "skipped"
        }

        const auth = integration.auth as MessengerAuthValue
        const newAuth = await integrationMessenger.refreshAuth?.({ auth })
        await messengerIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth as MessengerAuthValue,
        })
        return "refreshed"
      } catch (error) {
        await messengerIntegrationService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshMessengerIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await messengerIntegrationService.findForTokenRefreshByWorkspaceIds(
      workspaceIds,
    )
  const results = await runInBatches(integrations, (integration) =>
    refreshOneMessenger(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

async function refreshOneWhatsapp(
  id: string,
  workspaceId: string,
): Promise<RefreshResult> {
  if (!integrationWhatsapp.refreshAuth) {
    return "skipped"
  }

  return await distributedLock.runExclusive({
    key: `auth:refresh:whatsapp:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration =
          await integrationWhatsappService.findByIdForWorkspace({
            id,
            workspaceId,
          })
        if (!integration) {
          return "skipped"
        }

        const auth = integration.auth as WhatsappAuthValue
        if (auth.metadata.isManual) {
          return "skipped"
        }

        const newAuth = await integrationWhatsapp.refreshAuth?.({ auth })
        await integrationWhatsappService.updateAuth({
          id,
          workspaceId,
          auth: newAuth as WhatsappAuthValue,
        })
        return "refreshed"
      } catch (error) {
        await integrationWhatsappService.markTokenRefreshError(
          id,
          error instanceof Error ? error.message : String(error),
        )
        return "failed"
      }
    },
  })
}

async function refreshWhatsappIntegrations(
  workspaceIds: string[],
): Promise<RefreshSummary> {
  const integrations =
    await integrationWhatsappService.findForTokenRefreshByWorkspaceIds(
      workspaceIds,
    )
  const results = await runInBatches(integrations, (integration) =>
    refreshOneWhatsapp(integration.id, integration.workspaceId),
  )
  return toSummary(results)
}

/**
 * Excludes workspaces mid-deletion-grace-window or blocked for trial/quota
 * reasons (AGENTS.md invariant #14) from the bulk refresh, matching the gates
 * `workspaceActionClient` applies to every single-workspace mutation.
 */
async function filterRefreshableWorkspaceIds(
  workspaces: Array<{
    id: string
    ownerId: string
    scheduledDeletionAt?: Date | string | null
  }>,
): Promise<string[]> {
  const cloud = isCloud()
  const refreshableIds = await Promise.all(
    workspaces.map(async (workspace) => {
      if (isWorkspaceScheduledForDeletion(workspace)) {
        return null
      }
      if (cloud) {
        const { blocked } = await resolveWorkspaceBlockState(workspace.ownerId)
        if (blocked) {
          return null
        }
      }
      return workspace.id
    }),
  )
  return refreshableIds.filter((id): id is string => id !== null)
}

export const refreshAllChannelTokensAction = authActionClient.action(
  async ({ ctx }): Promise<RefreshSummary> => {
    const { workspaces } = await getAllWorkspaceMembers(ctx.user.id)
    const workspaceIds = await filterRefreshableWorkspaceIds(workspaces)
    if (workspaceIds.length === 0) {
      return { refreshed: 0, failed: 0 }
    }

    const summaries = await Promise.all([
      refreshZaloIntegrations(workspaceIds),
      refreshTiktokIntegrations(workspaceIds),
      refreshInstagramIntegrations(workspaceIds),
      refreshInstagramFacebookIntegrations(workspaceIds),
      refreshMessengerIntegrations(workspaceIds),
      refreshWhatsappIntegrations(workspaceIds),
    ])

    return sumSummaries(summaries)
  },
)
