import {
  coexistService,
  instagramIntegrationService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import {
  type ConnectionAdapter,
  connectionStateService,
} from "@chatbotx.io/business/connection"
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import {
  isDisconnectSafeError,
  type MessengerAuthValue,
  integration as messengerIntegration,
} from "@chatbotx.io/integration-messenger"
import { subscribePageToAppWebhook } from "@chatbotx.io/integration-messenger/apis/page"
import { logger } from "./logger"

type MessengerTeardownResult = {
  skipGenericRemoteTeardown: boolean
  withinTransaction: (tx: DatabaseClient) => Promise<void>
}

/**
 * Messenger-only disconnect teardown, shared by the legacy
 * `disconnectMessenger` builder action
 * (`apps/builder/src/features/integration-messenger/actions/disconnect-messenger.ts`)
 * and the generic engine `DELETE /v1/connections/{id}` path
 * (`lifecycle.ts`'s `disconnect`, wired through
 * `CONNECTION_REGISTRY.messenger.teardown` — see
 * `messengerConnectionTeardownHook` below). The engine path used to skip
 * all of this (H-4):
 *  - Preserves the Facebook Page webhook subscription when an Instagram
 *    integration still shares the same Page, instead of unsubscribing it.
 *  - Coexist-mode teardown for the integration.
 *  - `MetaCapiEvent` cleanup — a polymorphic FK not cascade-deleted by the
 *    satellite row's removal.
 *  - Tag cleanup + the satellite row, via `messengerIntegrationService.disconnect`.
 *
 * Remote Graph API calls run OUTSIDE the transaction; only the returned
 * `withinTransaction` closure's DB writes use `tx`.
 */
export const tearDownMessengerConnection = async (input: {
  workspaceId: string
  integrationId: string
  auth: MessengerAuthValue
}): Promise<MessengerTeardownResult> => {
  const { workspaceId, integrationId, auth } = input

  try {
    const hasSharedInstagramIntegration =
      await instagramIntegrationService.existsForPage({
        pageId: auth.metadata.pageId,
        clientId: auth.clientId,
      })

    if (hasSharedInstagramIntegration) {
      try {
        await subscribePageToAppWebhook({
          pageId: auth.metadata.pageId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
          subscribedFields: "general_info",
        })
      } catch (error) {
        logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            pageId: auth.metadata.pageId,
          },
          "Failed to preserve shared Messenger webhook subscription during disconnect",
        )
      }
    } else {
      try {
        await messengerIntegration.disconnect(auth)
      } catch (error) {
        // `isDisconnectSafeError` distinguishes a non-retryable Graph
        // failure (app already uninstalled, page gone, token revoked,
        // permissions lost — nothing left to unsubscribe) from a
        // transient one (e.g. a rate limit) worth calling out separately
        // in the logs below. Either way this rethrows into the outer
        // `catch` below, which treats every remote-phase failure the same:
        // logged, then local database cleanup still proceeds regardless.
        // A transient error does NOT propagate out to the caller — the
        // remote Graph API phase is best-effort end to end (see the outer
        // `catch`'s own comment); only the local cleanup here is
        // authoritative, and it must never be skipped, or this is exactly
        // what leaves orphaned `coexist`/`MetaCapiEvent` rows behind.
        if (!isDisconnectSafeError(error)) {
          throw error
        }
        logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            pageId: auth.metadata.pageId,
          },
          "Messenger page unsubscribe failed with a non-retryable Graph error — proceeding with local disconnect",
        )
      }
    }
  } catch (error) {
    // The remote Graph API phase above is best-effort: whatever happens to
    // it — an unsafe/non-retryable Graph failure rethrown above, or
    // `existsForPage` itself throwing on a database error before the
    // shared-page decision is even made — must never block the local
    // cleanup below. Skipping that cleanup is exactly what leaves orphaned
    // `coexist`/`MetaCapiEvent` rows behind, which this teardown exists to
    // prevent.
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
        pageId: auth.metadata.pageId,
        workspaceId,
        integrationId,
      },
      "Messenger remote Graph API teardown failed — proceeding with local database cleanup",
    )
  }

  return {
    // This function already owns the whole remote teardown decision above —
    // the engine's generic `integration.disconnect` + `provider.webhook.unsubscribe`
    // calls would re-run (or clobber) the same Graph API work.
    skipGenericRemoteTeardown: true,
    withinTransaction: async (tx) => {
      await coexistService.tearDownForIntegration({
        workspaceId,
        integrationId,
        channel: "messenger",
        currentError: "Integration disconnected",
        tx,
      })

      await metaCapiEventRepository.deleteByIntegration(
        { workspaceId, channel: "messenger", integrationId },
        tx,
      )

      await messengerIntegrationService.disconnect({ id: integrationId, tx })
    },
  }
}

/**
 * Builder-action-facing wrapper around {@link tearDownMessengerConnection}:
 * runs the remote Graph API teardown, then opens the DB transaction itself
 * and runs the returned `withinTransaction` closure plus the matching
 * `connectionStateService.disconnectInbox` transition inside it, so
 * `disconnect-messenger.ts` (apps/builder) never has to import `db` from
 * `@chatbotx.io/database/client` just to open a transaction.
 */
export const disconnectMessengerConnection = async (input: {
  workspaceId: string
  integrationId: string
  inboxId: string
  ownerId: string
  auth: MessengerAuthValue
}): Promise<void> => {
  const { workspaceId, integrationId, inboxId, ownerId, auth } = input

  const teardown = await tearDownMessengerConnection({
    workspaceId,
    integrationId,
    auth,
  })

  await db.transaction(async (tx) => {
    await teardown.withinTransaction(tx)

    await connectionStateService.disconnectInbox({
      inboxId,
      ownerId,
      workspaceId,
      tx,
    })
  })
}

/**
 * `ConnectionAdapter["teardown"]`-shaped wrapper around
 * {@link tearDownMessengerConnection} for `CONNECTION_REGISTRY.messenger`
 * (`registry.ts`). The engine's `Connection` row only carries `inboxId` as
 * its messenger foreign key — not the `IntegrationMessenger` satellite's own
 * `id` that coexist/MetaCapiEvent/tag cleanup key off — so this resolves it
 * first.
 */
export const messengerConnectionTeardownHook: ConnectionAdapter["teardown"] =
  async ({ connection, auth }) => {
    const integrationRow = await messengerIntegrationService.findByInboxId(
      connection.inboxId as string,
    )
    return tearDownMessengerConnection({
      workspaceId: connection.workspaceId,
      integrationId: integrationRow.id,
      auth: auth as MessengerAuthValue,
    })
  }
