import {
  instagramIntegrationService,
  type MetaAppCredentialType,
  platformCredentialService,
} from "@chatbotx.io/business"
import {
  type IntegrationType,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import { unsubscribePageFromInstagramWebhook } from "@chatbotx.io/integration-instagram"
import { unsubscribePageFromAppWebhook } from "@chatbotx.io/integration-messenger/apis/page"
import { logger } from "../lib/logger"

/**
 * Thrown when a webhook-driven job references an integration whose row has
 * already been deleted. Carries the channel + identifier so the orphaned
 * subscription can be cleaned up (see `handleOrphanedIntegration`). Both fields
 * are public ids — safe to log.
 */
export class IntegrationNotFoundError extends Error {
  readonly channel: IntegrationType
  readonly identifier: string

  constructor(channel: IntegrationType, identifier: string) {
    super(`Integration not found: ${channel} ${identifier}`)
    this.name = "IntegrationNotFoundError"
    this.channel = channel
    this.identifier = identifier
  }
}

type OrphanUnsubscribe = (props: {
  identifier: string
  appAccessToken: string
}) => Promise<void>

/**
 * How to revoke a still-live Meta webhook subscription for a channel whose
 * integration row is gone. Only channels whose subscription can be dropped with
 * the platform app access token get a strategy; every other channel is skipped.
 */
type OrphanCleanupStrategy = {
  /** Platform credential whose app access token authorizes the unsubscribe. */
  readonly credentialType: MetaAppCredentialType
  /**
   * When another channel still shares this identifier's page subscription,
   * unsubscribing would break that sibling — so skip the cleanup instead.
   */
  readonly hasSurvivingSibling?: (identifier: string) => Promise<boolean>
  readonly unsubscribe: OrphanUnsubscribe
}

const ORPHAN_CLEANUP_STRATEGIES: Partial<
  Record<IntegrationType, OrphanCleanupStrategy>
> = {
  [integrationTypes.enum.messenger]: {
    credentialType: integrationTypes.enum.messenger,
    hasSurvivingSibling: (pageId) =>
      instagramIntegrationService.existsByPageId(pageId),
    unsubscribe: ({ identifier, appAccessToken }) =>
      unsubscribePageFromAppWebhook({ pageId: identifier, appAccessToken }),
  },
  [integrationTypes.enum.instagram]: {
    credentialType: integrationTypes.enum.instagram,
    unsubscribe: ({ identifier, appAccessToken }) =>
      unsubscribePageFromInstagramWebhook({
        igId: identifier,
        accessToken: appAccessToken,
      }),
  },
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Best-effort cleanup for a webhook that keeps arriving after its integration
 * row was deleted. Never throws: the caller marks the job unrecoverable
 * regardless of what happens here.
 */
export async function handleOrphanedIntegration(
  error: IntegrationNotFoundError,
): Promise<void> {
  const { channel, identifier } = error
  const strategy = ORPHAN_CLEANUP_STRATEGIES[channel]

  if (!strategy) {
    logger.info(
      { channel, identifier },
      "Skipping orphaned integration cleanup for unsupported channel",
    )
    return
  }

  try {
    if (await strategy.hasSurvivingSibling?.(identifier)) {
      logger.info(
        { channel, identifier },
        "Skipping orphaned integration cleanup because a sibling channel still shares the subscription",
      )
      return
    }

    const appAccessToken =
      await platformCredentialService.resolvePlatformAppAccessToken(
        strategy.credentialType,
      )

    if (!appAccessToken) {
      logger.warn(
        { channel, identifier },
        "Missing platform credential for orphaned integration cleanup",
      )
      return
    }

    await strategy.unsubscribe({ identifier, appAccessToken })
    logger.info(
      { channel, identifier },
      "Orphaned integration cleanup completed",
    )
  } catch (cleanupError) {
    logger.warn(
      { channel, identifier, err: toErrorMessage(cleanupError) },
      "Orphaned integration cleanup failed",
    )
  }
}
