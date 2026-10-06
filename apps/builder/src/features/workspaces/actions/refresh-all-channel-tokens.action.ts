"use server"

import {
  instagramIntegrationService,
  integrationWhatsappService,
  isWorkspaceScheduledForDeletion,
  messengerIntegrationService,
  tiktokIntegrationService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  type InstagramAuthValue,
  integration as integrationInstagram,
  isRevokedTokenError as isInstagramRevokedTokenError,
} from "@chatbotx.io/integration-instagram"
import {
  integration as integrationInstagramFacebook,
  isRevokedTokenError as isInstagramFacebookRevokedTokenError,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  integration as integrationMessenger,
  isRevokedTokenError as isMessengerRevokedTokenError,
  logMessengerWelcomeProfile,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import {
  isRevokedTokenError as isTiktokRevokedTokenError,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken as refreshTiktokAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { parseTiktokScopes } from "@chatbotx.io/integration-tiktok/lib/scopes"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import {
  integration as integrationWhatsapp,
  isRevokedTokenError as isWhatsappRevokedTokenError,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import {
  calculateExpiresAt,
  isRevokedTokenError as isZaloRevokedTokenError,
  refreshAccessToken as refreshZaloAccessToken,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { distributedLock } from "@chatbotx.io/redis"
import { isCloud } from "@/env"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

const BATCH_SIZE = 50
// Must outlive the channel APIs' HTTP timeouts (Zalo's OAuth client allows
// 30s): the Zalo refresh token is single-use, so if the lock expired mid-call
// the daily cron could consume the same refresh token concurrently and
// clobber the rotated tokens.
const REFRESH_LOCK_TIMEOUT_SECONDS = 60

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
    results.push(
      ...(await Promise.all(
        // A failed lock acquisition (the daily cron already refreshing this
        // row, redis hiccup) throws outside the worker's own try/catch; it
        // must not reject the whole batch and abort the remaining rows.
        batch.map((item) => worker(item).catch((): RefreshResult => "failed")),
      )),
    )
  }
  return results
}

type RefreshGuardConfig<TIntegration, TAuth> = {
  /** Used as the `auth:refresh:<channel>:<id>` distributed lock key segment. */
  channel: string
  /** Provider name used in the `Failed to refresh/record ... channel token` log messages. */
  errorLabel: string
  /** `auditService.record`'s `detail` text on a successful refresh. */
  auditDetail: string
  /**
   * Static capability check (e.g. "does this channel support refreshAuth at
   * all?") evaluated BEFORE the lock is acquired; `false` skips without ever
   * touching Redis.
   */
  canAttempt?: () => boolean
  fetchIntegration: (
    id: string,
    workspaceId: string,
  ) => Promise<TIntegration | null | undefined>
  getAuth: (integration: TIntegration) => TAuth
  /** Post-fetch skip check (missing refresh token, manual-auth row, ...). */
  shouldSkip?: (auth: TAuth) => boolean
  refresh: (auth: TAuth) => Promise<TAuth>
  updateAuth: (id: string, workspaceId: string, auth: TAuth) => Promise<unknown>
  markTokenRefreshError: (params: {
    id: string
    workspaceId: string
    error: string
    isRevoked: boolean
  }) => Promise<unknown>
  isRevokedTokenError: (error: unknown) => boolean
}

/**
 * Shared lock-acquire → fetch → refresh-or-skip → persist → audit backbone
 * for every channel's per-row token refresh, with the same error handling
 * (log, best-effort `markTokenRefreshError`, never let a `markTokenRefreshError`
 * throw escape and abort the row). Returns the refreshed `auth` alongside the
 * result so callers needing a post-lock side effect (Messenger's welcome
 * profile read) can run it after the lock is released.
 */
async function refreshGuarded<TIntegration, TAuth>(
  id: string,
  workspaceId: string,
  config: RefreshGuardConfig<TIntegration, TAuth>,
): Promise<{ result: RefreshResult; auth?: TAuth }> {
  if (config.canAttempt && !config.canAttempt()) {
    return { result: "skipped" }
  }

  return await distributedLock.runExclusive({
    key: `auth:refresh:${config.channel}:${id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const integration = await config.fetchIntegration(id, workspaceId)
        if (!integration) {
          return { result: "skipped" as const }
        }

        const auth = config.getAuth(integration)
        if (config.shouldSkip?.(auth)) {
          return { result: "skipped" as const }
        }

        const newAuth = await config.refresh(auth)
        await config.updateAuth(id, workspaceId, newAuth)
        await auditService.record({
          workspaceId,
          action: "refresh",
          detail: config.auditDetail,
        })
        return { result: "refreshed" as const, auth: newAuth }
      } catch (error) {
        logger.error(
          { err: error, integrationId: id, workspaceId },
          `Failed to refresh ${config.errorLabel} channel token`,
        )
        try {
          await config.markTokenRefreshError({
            id,
            workspaceId,
            error: error instanceof Error ? error.message : String(error),
            isRevoked: config.isRevokedTokenError(error),
          })
        } catch (markError) {
          logger.error(
            { err: markError, integrationId: id, workspaceId },
            `Failed to record ${config.errorLabel} token refresh error`,
          )
        }
        return { result: "failed" as const }
      }
    },
  })
}

type ChannelRefreshConfig<TIntegration, TAuth> = RefreshGuardConfig<
  TIntegration,
  TAuth
> & {
  findWorkspaceIntegrations: (
    workspaceIds: string[],
  ) => Promise<Array<{ id: string; workspaceId: string }>>
  /** Runs once the lock has been released on a successful refresh. */
  afterRefresh?: (auth: TAuth) => Promise<void>
}

async function refreshChannel<TIntegration, TAuth>(
  workspaceIds: string[],
  config: ChannelRefreshConfig<TIntegration, TAuth>,
): Promise<RefreshSummary> {
  const integrations = await config.findWorkspaceIntegrations(workspaceIds)
  const results = await runInBatches(integrations, async (integration) => {
    const { result, auth } = await refreshGuarded(
      integration.id,
      integration.workspaceId,
      config,
    )
    if (auth) {
      await config.afterRefresh?.(auth)
    }
    return result
  })
  return toSummary(results)
}

const refreshZaloIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "zalo",
    errorLabel: "Zalo",
    auditDetail: "refreshed the Zalo channel permissions",
    findWorkspaceIntegrations: (ids) =>
      zaloIntegrationService.findAllByWorkspaceIds(ids),
    fetchIntegration: (id, workspaceId) =>
      zaloIntegrationService.findById({ id, workspaceId }),
    getAuth: (integration) => integration.auth as ZaloAuthValue,
    shouldSkip: (auth) => !auth.tokens.refreshToken,
    refresh: async (auth) => {
      const newTokens = await refreshZaloAccessToken(
        auth,
        auth.tokens.refreshToken as string,
      )
      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: calculateExpiresAt(newTokens.expires_in),
        },
      }
    },
    updateAuth: (id, _workspaceId, auth) =>
      zaloIntegrationService.updateAuth(id, auth),
    markTokenRefreshError: (params) =>
      zaloIntegrationService.markTokenRefreshError(params),
    isRevokedTokenError: isZaloRevokedTokenError,
  })

const refreshTiktokIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "tiktok",
    errorLabel: "TikTok",
    auditDetail: "refreshed the TikTok channel token",
    findWorkspaceIntegrations: (ids) =>
      tiktokIntegrationService.findAllByWorkspaceIds(ids),
    fetchIntegration: (id, workspaceId) =>
      tiktokIntegrationService.findById({ id, workspaceId }),
    getAuth: (integration) => integration.auth as TiktokAuthValue,
    shouldSkip: (auth) => !auth.tokens.refreshToken,
    refresh: async (auth) => {
      const newTokens = await refreshTiktokAccessToken(
        { clientId: auth.clientId, clientSecret: auth.clientSecret },
        auth.tokens.refreshToken as string,
      )
      return {
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
        metadata: {
          ...auth.metadata,
          scopes: parseTiktokScopes(newTokens.scope),
        },
      }
    },
    updateAuth: (id, workspaceId, auth) =>
      tiktokIntegrationService.updateAuth({ id, workspaceId, auth }),
    markTokenRefreshError: (params) =>
      tiktokIntegrationService.markTokenRefreshError(params),
    isRevokedTokenError: isTiktokRevokedTokenError,
  })

const refreshInstagramIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "instagram",
    errorLabel: "Instagram",
    auditDetail: "refreshed the Instagram channel token",
    canAttempt: () => Boolean(integrationInstagram.refreshAuth),
    findWorkspaceIntegrations: (ids) =>
      instagramIntegrationService.findForTokenRefreshByWorkspaceIds(ids),
    fetchIntegration: (id, workspaceId) =>
      instagramIntegrationService.findByIdForWorkspace({ id, workspaceId }),
    getAuth: (integration) => integration.auth as InstagramAuthValue,
    refresh: async (auth) =>
      (await integrationInstagram.refreshAuth?.({
        auth,
      })) as InstagramAuthValue,
    updateAuth: (id, workspaceId, auth) =>
      instagramIntegrationService.updateAuth({ id, workspaceId, auth }),
    markTokenRefreshError: (params) =>
      instagramIntegrationService.markTokenRefreshError(params),
    isRevokedTokenError: isInstagramRevokedTokenError,
  })

const refreshInstagramFacebookIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "instagramFacebook",
    errorLabel: "Facebook-linked Instagram",
    auditDetail: "refreshed the Instagram channel token",
    canAttempt: () => Boolean(integrationInstagramFacebook.refreshAuth),
    findWorkspaceIntegrations: (ids) =>
      instagramIntegrationService.findFacebookForTokenRefreshByWorkspaceIds(
        ids,
      ),
    fetchIntegration: (id, workspaceId) =>
      instagramIntegrationService.findByIdForWorkspace({ id, workspaceId }),
    getAuth: (integration) => integration.auth as InstagramAuthValue,
    refresh: async (auth) =>
      (await integrationInstagramFacebook.refreshAuth?.({
        auth,
      })) as InstagramAuthValue,
    updateAuth: (id, workspaceId, auth) =>
      instagramIntegrationService.updateAuth({ id, workspaceId, auth }),
    markTokenRefreshError: (params) =>
      instagramIntegrationService.markTokenRefreshError(params),
    isRevokedTokenError: isInstagramFacebookRevokedTokenError,
  })

const refreshMessengerIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "messenger",
    errorLabel: "Messenger",
    auditDetail: "refreshed the Messenger channel token",
    canAttempt: () => Boolean(integrationMessenger.refreshAuth),
    findWorkspaceIntegrations: (ids) =>
      messengerIntegrationService.findForTokenRefreshByWorkspaceIds(ids),
    fetchIntegration: (id, workspaceId) =>
      messengerIntegrationService.findByIdForWorkspace({ id, workspaceId }),
    getAuth: (integration) => integration.auth as MessengerAuthValue,
    refresh: async (auth) =>
      (await integrationMessenger.refreshAuth?.({
        auth,
      })) as MessengerAuthValue,
    updateAuth: (id, workspaceId, auth) =>
      messengerIntegrationService.updateAuth({ id, workspaceId, auth }),
    markTokenRefreshError: (params) =>
      messengerIntegrationService.markTokenRefreshError(params),
    isRevokedTokenError: isMessengerRevokedTokenError,
    // Diagnostic Graph read kept outside the lock so it never extends the
    // refresh critical section; it never rejects, so the row's result stands.
    afterRefresh: (auth) =>
      logMessengerWelcomeProfile({ ctx: { auth }, reason: "tokenRefreshed" }),
  })

const refreshWhatsappIntegrations = (workspaceIds: string[]) =>
  refreshChannel(workspaceIds, {
    channel: "whatsapp",
    errorLabel: "WhatsApp",
    auditDetail: "refreshed the WhatsApp channel token",
    canAttempt: () => Boolean(integrationWhatsapp.refreshAuth),
    findWorkspaceIntegrations: (ids) =>
      integrationWhatsappService.findForTokenRefreshByWorkspaceIds(ids),
    fetchIntegration: (id, workspaceId) =>
      integrationWhatsappService.findByIdForWorkspace({ id, workspaceId }),
    getAuth: (integration) => integration.auth as WhatsappAuthValue,
    shouldSkip: (auth) => Boolean(auth.metadata.isManual),
    refresh: async (auth) =>
      (await integrationWhatsapp.refreshAuth?.({ auth })) as WhatsappAuthValue,
    updateAuth: (id, workspaceId, auth) =>
      integrationWhatsappService.updateAuth({ id, workspaceId, auth }),
    markTokenRefreshError: (params) =>
      integrationWhatsappService.markTokenRefreshError(params),
    isRevokedTokenError: isWhatsappRevokedTokenError,
  })

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
