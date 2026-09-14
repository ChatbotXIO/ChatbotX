import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken as refreshTiktokAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import {
  calculateExpiresAt,
  refreshAccessToken as refreshZaloAccessToken,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { distributedLock } from "@chatbotx.io/redis"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { instagramIntegrationService } from "../integration-instagram/service"
import { messengerIntegrationService } from "../integration-messenger/service"
import { tiktokIntegrationService } from "../integration-tiktok/service"
import { integrationWhatsappService } from "../integration-whatsapp/service"
import { zaloIntegrationService } from "../integration-zalo/service"

const BATCH_SIZE = 50
// Must outlive the channel APIs' HTTP timeouts (Zalo's OAuth client allows
// 30s): the Zalo refresh token is single-use, so if the lock expired mid-call
// concurrent refreshes could consume the same refresh token and clobber the
// rotated credentials.
const REFRESH_LOCK_TIMEOUT_SECONDS = 60

type RefreshResult = "failed" | "refreshed" | "skipped"
type RefreshSummary = { refreshed: number; failed: number }

/**
 * `@chatbotx.io/integration-instagram`, `-instagram-facebook`, `-messenger`,
 * and `-whatsapp` each already depend on `@chatbotx.io/business` (their
 * channel-connect wiring lives under `apps/builder`'s integration features,
 * which call back into business services). This package therefore must not
 * import any of those four SDKs directly — doing so creates a workspace
 * dependency cycle (`pnpm install` warns "cyclic workspace dependencies").
 * `@chatbotx.io/integration-tiktok` and `@chatbotx.io/integration-zalo` have
 * no such reverse dependency and are imported directly above.
 *
 * The caller — `apps/builder`, which has no cycle constraint — supplies the
 * actual provider refresh call as a primitive. Same dependency-injection
 * shape as `integration-whatsapp/coexist.ts`'s `SetCoexistTriggerSync`.
 */
export type ChannelRefreshAuthCallback = (
  auth: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export type ChannelTokenRefreshCallbacks = {
  refreshInstagramAuth?: ChannelRefreshAuthCallback
  refreshInstagramFacebookAuth?: ChannelRefreshAuthCallback
  refreshMessengerAuth?: ChannelRefreshAuthCallback
  refreshWhatsappAuth?: ChannelRefreshAuthCallback
}

const toSummary = (results: RefreshResult[]): RefreshSummary => ({
  refreshed: results.filter((result) => result === "refreshed").length,
  failed: results.filter((result) => result === "failed").length,
})

const runInBatches = async <T>(
  items: T[],
  worker: (item: T) => Promise<RefreshResult>,
): Promise<RefreshResult[]> => {
  const results: RefreshResult[] = []
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const batch = items.slice(index, index + BATCH_SIZE)
    results.push(
      ...(await Promise.all(
        batch.map((item) => worker(item).catch((): RefreshResult => "failed")),
      )),
    )
  }
  return results
}

const refreshOneZalo = async (
  id: string,
  workspaceId: string,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the Zalo channel permissions",
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

const refreshZaloIntegrations = async (
  workspaceId: string,
): Promise<RefreshSummary> => {
  const integrations = await zaloIntegrationService.findAllByWorkspaceIds([
    workspaceId,
  ])
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneZalo(integration.id, integration.workspaceId),
    ),
  )
}

const refreshOneTiktok = async (
  id: string,
  workspaceId: string,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the TikTok channel token",
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

const refreshTiktokIntegrations = async (
  workspaceId: string,
): Promise<RefreshSummary> => {
  const integrations = await tiktokIntegrationService.findAllByWorkspaceIds([
    workspaceId,
  ])
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneTiktok(integration.id, integration.workspaceId),
    ),
  )
}

const refreshOneInstagram = async (
  id: string,
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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

        const newAuth = await refreshAuth(
          integration.auth as Record<string, unknown>,
        )
        await instagramIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth,
        })
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the Instagram channel token",
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

const refreshInstagramIntegrations = async (
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback | undefined,
): Promise<RefreshSummary> => {
  if (!refreshAuth) {
    return { refreshed: 0, failed: 0 }
  }
  const integrations =
    await instagramIntegrationService.findForTokenRefreshByWorkspaceIds([
      workspaceId,
    ])
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneInstagram(integration.id, integration.workspaceId, refreshAuth),
    ),
  )
}

const refreshOneInstagramFacebook = async (
  id: string,
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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

        const newAuth = await refreshAuth(
          integration.auth as Record<string, unknown>,
        )
        await instagramIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth,
        })
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the Instagram channel token",
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

const refreshInstagramFacebookIntegrations = async (
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback | undefined,
): Promise<RefreshSummary> => {
  if (!refreshAuth) {
    return { refreshed: 0, failed: 0 }
  }
  const integrations =
    await instagramIntegrationService.findFacebookForTokenRefreshByWorkspaceIds(
      [workspaceId],
    )
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneInstagramFacebook(
        integration.id,
        integration.workspaceId,
        refreshAuth,
      ),
    ),
  )
}

const refreshOneMessenger = async (
  id: string,
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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

        const newAuth = await refreshAuth(
          integration.auth as Record<string, unknown>,
        )
        await messengerIntegrationService.updateAuth({
          id,
          workspaceId,
          auth: newAuth,
        })
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the Messenger channel token",
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

const refreshMessengerIntegrations = async (
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback | undefined,
): Promise<RefreshSummary> => {
  if (!refreshAuth) {
    return { refreshed: 0, failed: 0 }
  }
  const integrations =
    await messengerIntegrationService.findForTokenRefreshByWorkspaceIds([
      workspaceId,
    ])
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneMessenger(integration.id, integration.workspaceId, refreshAuth),
    ),
  )
}

/** Just enough shape to apply the manual-token WhatsApp skip without the real `WhatsappAuthValue` type. */
type WhatsappManualAuth = { metadata?: { isManual?: boolean } }

const refreshOneWhatsapp = async (
  id: string,
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback,
): Promise<RefreshResult> =>
  await distributedLock.runExclusive({
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

        if ((integration.auth as WhatsappManualAuth).metadata?.isManual) {
          return "skipped"
        }

        const newAuth = await refreshAuth(
          integration.auth as Record<string, unknown>,
        )
        await integrationWhatsappService.updateAuth({
          id,
          workspaceId,
          auth: newAuth,
        })
        await dispatchAuditRecord({
          workspaceId,
          action: "refresh",
          detail: "refreshed the WhatsApp channel token",
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

const refreshWhatsappIntegrations = async (
  workspaceId: string,
  refreshAuth: ChannelRefreshAuthCallback | undefined,
): Promise<RefreshSummary> => {
  if (!refreshAuth) {
    return { refreshed: 0, failed: 0 }
  }
  const integrations =
    await integrationWhatsappService.findForTokenRefreshByWorkspaceIds([
      workspaceId,
    ])
  return toSummary(
    await runInBatches(integrations, (integration) =>
      refreshOneWhatsapp(integration.id, integration.workspaceId, refreshAuth),
    ),
  )
}

class ChannelTokenRefreshService {
  async refreshWorkspace(
    props: { workspaceId: string } & ChannelTokenRefreshCallbacks,
  ): Promise<RefreshSummary> {
    const {
      workspaceId,
      refreshInstagramAuth,
      refreshInstagramFacebookAuth,
      refreshMessengerAuth,
      refreshWhatsappAuth,
    } = props
    const summaries = await Promise.all([
      refreshZaloIntegrations(workspaceId),
      refreshTiktokIntegrations(workspaceId),
      refreshInstagramIntegrations(workspaceId, refreshInstagramAuth),
      refreshInstagramFacebookIntegrations(
        workspaceId,
        refreshInstagramFacebookAuth,
      ),
      refreshMessengerIntegrations(workspaceId, refreshMessengerAuth),
      refreshWhatsappIntegrations(workspaceId, refreshWhatsappAuth),
    ])

    return summaries.reduce(
      (summary, next) => ({
        refreshed: summary.refreshed + next.refreshed,
        failed: summary.failed + next.failed,
      }),
      { refreshed: 0, failed: 0 },
    )
  }
}

export const channelTokenRefreshService = new ChannelTokenRefreshService()
