import "server-only"

import {
  messengerIntegrationService,
  tagSyncService,
} from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  debugToken,
  integration as integrationMessenger,
  toAppAccessToken,
} from "@chatbotx.io/integration-messenger"
import { runBrandingFollowUps } from "@/features/channel-connect/lib/branding-follow-ups"
import {
  captureConnectScopes,
  grantedScopesOfAuth,
} from "@/features/channel-connect/lib/capture-connect-scopes"
import { connectSessionCandidate } from "@/features/channel-connect/lib/connect-session-candidate"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import { logger } from "@/lib/log"

/**
 * Connects one Facebook page from a `ConnectSession` in `awaiting_selection`,
 * as a plain server function so both transports can call it: the oRPC route
 * the batch picker posts to (`api/connect.ts`, `CONNECT_CONCURRENCY` at a
 * time) and the server action kept for any non-picker caller.
 *
 * Replaces the pending-auth-cookie skeleton (`runConnectSequence` + `getUserPages`
 * re-fetch + `messengerIntegrationService.connectPage` — all three names
 * removed by this migration, kept here only as historical context) with
 * the unified `ConnectionService.connectTargets`, which already does the
 * lookup/duplicate/quota/FSM/webhook-subscribe work generically. This
 * function's own job shrinks to: resolve session context (workspace,
 * branding) via `connectSessionCandidate`, then run Messenger's own
 * post-connect follow-ups (persistent-menu branding, workspace-logo push,
 * tag-sync enqueue) that `connectTargets` deliberately does not — those are
 * product features layered on top of the generic connect, not part of it.
 *
 * Two deliberate, minor, display-only scope reductions versus the old flow
 * (both accepted rather than adding more plumbing to a generic connect
 * path for a legacy-only need):
 * - No `persistIntegrationUserInfo` call: that recorded the connecting
 *   Facebook user's own identity (name/avatar) from the *user-level* OAuth
 *   token. The unified session model only retains each candidate's own
 *page-level* token past `listCandidates`, so that identity isn't
 *   available here.
 * - `addBranding` pushes the persistent-menu entry straight to the Graph
 *   API; `runMessengerFollowUps` now also seeds `IntegrationMessenger
 *   .persistentMenus` with that same entry once the push succeeds (only
 *   when the row has no menu yet — a fresh connect always does), matching
 *   the old `connectPage({persistentMenus: [brandingMenuEntry]})`
 *   insert-time value without needing it at insert time.
 */
export async function connectMessengerPage({
  userId,
  sessionId,
  pageId,
}: {
  userId: string
  sessionId: string
  pageId: string
}): Promise<ConnectActionResultWire> {
  return await connectSessionCandidate({
    userId,
    sessionId,
    targetId: pageId,
    provider: "messenger",
    credentialType: "messenger",
    brandingChannel: "messenger",
    findRow: (inboxId) => messengerIntegrationService.findByInboxId(inboxId),
    runFollowUps: runMessengerFollowUps,
    followUpFailureMessage:
      "Messenger connect follow-up failed after the page was connected",
    connectFailureLog: "Failed to connect a Messenger page",
  })
}

async function runMessengerFollowUps({
  session,
  row: messengerRow,
}: {
  session: ResolvedConnectSession
  row: IntegrationMessengerModel
}): Promise<void> {
  const auth = messengerRow.auth as MessengerAuthValue
  const integrationRow = { ...messengerRow, auth }

  await captureConnectScopes({
    grantedScopes: await readPageScopes(auth),
    inboxId: messengerRow.inboxId,
    publisherKey: "facebook",
    workspaceId: session.workspace.id,
  })

  const results = await Promise.allSettled([
    runBrandingFollowUps({
      session,
      integrationRow,
      integration: integrationMessenger,
      integrationType: "messenger",
      persistBrandingMenu: messengerRow.persistentMenus.length
        ? undefined
        : (entry) =>
            messengerIntegrationService.seedPersistentMenu({
              id: messengerRow.id,
              entry,
            }),
    }),
    tagSyncService.enqueueChannelScan({
      workspaceId: session.workspace.id,
      channelType: channelTypes.enum.messenger,
      integrationId: messengerRow.id,
    }),
  ])
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (failed) {
    throw failed.reason
  }
}

/**
 * The page token's granted scopes from `/debug_token` (needs the app token, so
 * it reads the app credentials stored on the row's auth); `null` on any failure.
 */
async function readPageScopes(
  auth: MessengerAuthValue,
): Promise<string[] | null> {
  const fromMetadata = grantedScopesOfAuth(auth)
  if (fromMetadata) {
    return fromMetadata
  }
  try {
    const debug = await debugToken({
      appAccessToken: toAppAccessToken(auth),
      inputToken: auth.tokens.accessToken,
      version: auth.version,
    })
    return debug.scopes ?? null
  } catch (err) {
    logger.warn({ err }, "Messenger debug_token failed after connect")
    return null
  }
}
