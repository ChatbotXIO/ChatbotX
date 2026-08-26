import { isDatabaseError } from "@chatbotx.io/database/client"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { messagingAdsConnectionRepository } from "@chatbotx.io/database/repositories"
import type { MessagingAdsConnectionModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { FacebookAdsAuthValue } from "@chatbotx.io/integration-facebook-ads"
import { createId } from "@chatbotx.io/utils"
import { perChannelIntegrationIdsOrNull } from "../ads-conversion/channel-fields"
import { invalidateMessagingAdsCache } from "./graph-cache"

const UNIQUE_CONSTRAINTS = new Set([
  "MessagingAdsConnection_integrationWhatsappId_key",
  "MessagingAdsConnection_integrationMessengerId_key",
  "MessagingAdsConnection_integrationInstagramId_key",
])

const isIntegrationUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    typeof error.cause.constraint === "string" &&
    UNIQUE_CONSTRAINTS.has(error.cause.constraint)
  )
}

export type MessagingAdsIntegrationRef = {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}

const scopeOf = (input: {
  channel: MessagingAdChannel
  integrationId: string
}) => `${input.channel}:${input.integrationId}`

/**
 * Per-integration Facebook Ads connection for the messaging-ads boxes
 * (CTWA/CTM/CTID) — out/plan/ctwa-ctm-ctid-box-merge.md "Auth =
 * per-integration". Scoped by `workspaceId` + the channel's integration FK
 * on every lookup: the FK column alone does not prove the referenced
 * integration belongs to the caller's workspace (no DB-level composite FK
 * for that — v3 correction #10), so every method here takes `workspaceId`
 * and passes it straight through to the repository.
 */
class MessagingAdsConnectionService {
  findForIntegration(
    input: MessagingAdsIntegrationRef,
  ): Promise<MessagingAdsConnectionModel | null> {
    return messagingAdsConnectionRepository.findForIntegration({
      workspaceId: input.workspaceId,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
    })
  }

  /**
   * Connect or reconnect ONE integration's messaging-ads connection.
   * Reconnecting replaces the stored token and clears any `invalid` status
   * left by `markInvalid` (a prior Graph 190 error). Race-safe against a
   * concurrent first-connect for the SAME integration (two callers racing
   * `findForIntegration` -> not-found -> insert both attempt an insert; the
   * loser's insert hits the per-integration unique index and falls back to
   * an update instead of throwing) — mirrors
   * `integrationFacebookAdsService.upsert`.
   */
  async upsertFromOAuth(
    input: MessagingAdsIntegrationRef & { auth: FacebookAdsAuthValue },
  ): Promise<MessagingAdsConnectionModel> {
    const fk = perChannelIntegrationIdsOrNull(
      input.channel,
      input.integrationId,
    )
    const encryptedAuth = await encryptUtils.encryptObject(input.auth)

    const existing = await messagingAdsConnectionRepository.findForIntegration({
      workspaceId: input.workspaceId,
      ...fk,
    })
    const connection = existing
      ? ((await messagingAdsConnectionRepository.updateAuth({
          id: existing.id,
          workspaceId: input.workspaceId,
          auth: encryptedAuth,
        })) ?? existing)
      : await this.createOrFallbackToUpdate(input, fk, encryptedAuth)

    // A reconnect may attach a token with different ad-account access —
    // never serve the previous grant's cached Graph reads after this.
    await invalidateMessagingAdsCache(scopeOf(input))
    return connection
  }

  private async createOrFallbackToUpdate(
    input: MessagingAdsIntegrationRef,
    fk: ReturnType<typeof perChannelIntegrationIdsOrNull>,
    encryptedAuth: Awaited<ReturnType<typeof encryptUtils.encryptObject>>,
  ): Promise<MessagingAdsConnectionModel> {
    try {
      return await messagingAdsConnectionRepository.create({
        id: createId(),
        workspaceId: input.workspaceId,
        channel: input.channel,
        ...fk,
        auth: encryptedAuth,
      })
    } catch (error) {
      if (!isIntegrationUniqueViolation(error)) {
        throw error
      }
      const winner = await messagingAdsConnectionRepository.findForIntegration({
        workspaceId: input.workspaceId,
        ...fk,
      })
      if (!winner) {
        throw error
      }
      const updated = await messagingAdsConnectionRepository.updateAuth({
        id: winner.id,
        workspaceId: input.workspaceId,
        auth: encryptedAuth,
      })
      return updated ?? winner
    }
  }

  /** Flags the connection as needing a reconnect — a Graph 190 (expired/invalidated token) error, or a decrypt/parse failure on the stored auth blob. */
  async markInvalid(input: MessagingAdsIntegrationRef): Promise<void> {
    await messagingAdsConnectionRepository.updateStatus({
      workspaceId: input.workspaceId,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
      status: "invalid",
    })
  }

  async disconnect(input: MessagingAdsIntegrationRef): Promise<void> {
    const existing = await this.findForIntegration(input)
    if (!existing) {
      return
    }
    await messagingAdsConnectionRepository.remove({
      id: existing.id,
      workspaceId: input.workspaceId,
    })
    await invalidateMessagingAdsCache(scopeOf(input))
  }
}

export const messagingAdsConnectionService = new MessagingAdsConnectionService()
