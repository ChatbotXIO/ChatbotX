import "server-only"

import {
  buildContext,
  messengerIntegrationService,
  tagSyncService,
} from "@chatbotx.io/business"
import { connectionService } from "@chatbotx.io/connections"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import {
  connectedOutcome,
  duplicatedOutcome,
  notSelectableOutcome,
  runConnectFollowUps,
  toConnectActionFailure,
} from "@/features/channel-connect/lib/connect-action-outcomes"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import { resolveConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import { BRANDING_TITLE } from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"

type MessengerSession = ResolvedConnectSession<"messenger">

/**
 * Connects one Facebook page from a `ConnectSession` in `awaiting_selection`,
 * as a plain server function so both transports can call it: the oRPC route
 * the batch picker posts to (`api/connect.ts`, `CONNECT_CONCURRENCY` at a
 * time) and the server action kept for any non-picker caller.
 *
 * Replaces the pending-auth-cookie skeleton (`runConnectSequence` +
 * `getUserPages` re-fetch + `messengerIntegrationService.connectPage`) with
 * the unified `ConnectionService.connectTargets`, which already does the
 * lookup/duplicate/quota/FSM/webhook-subscribe work generically. This
 * function's own job shrinks to: resolve session context (workspace,
 * branding), call `connectTargets` for the one target, then run Messenger's
 * own post-connect follow-ups (persistent-menu branding, workspace-logo
 * push, tag-sync enqueue) that `connectTargets` deliberately does not —
 * those are product features layered on top of the generic connect, not
 * part of it.
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
 *   API (it reads/writes the page's *live* menu, never the DB), so the
 *   branding link still reaches end users — but `IntegrationMessenger
 *   .persistentMenus` (the DB's own local record, used by the persistent-
 *   menu settings UI) is left at its default `[]` instead of pre-seeded
 *   with this entry, unlike the old `connectPage({persistentMenus:
 *   [brandingMenuEntry]})` insert-time value.
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
  let name = pageId

  try {
    const session = await resolveConnectSession({
      userId,
      sessionId,
      credentialType: "messenger",
      brandingChannel: "messenger",
    })

    const target = session.session.targets.find((t) => t.id === pageId)
    if (!target) {
      return notSelectableOutcome({ sourceId: pageId, name })
    }
    name = target.name

    if (!target.selectable) {
      return target.alreadyConnected
        ? duplicatedOutcome({ sourceId: pageId, name })
        : notSelectableOutcome({ sourceId: pageId, name })
    }

    const result = await connectionService.connectTargets({
      sessionId,
      workspaceId: session.workspace.id,
      targetIds: [pageId],
      actorUserId: userId,
    })
    const outcome = result.outcomes[0]
    const connection = result.connections[0]

    if (!(outcome && outcome.status === "connected" && connection)) {
      return {
        kind: "outcome",
        outcome: {
          sourceId: pageId,
          name,
          status: outcome?.status ?? "failed",
          reason: outcome?.reason ?? "unknown",
          detail: outcome?.detail,
          coexistEligible: false,
        },
      }
    }

    const messengerRow = await messengerIntegrationService.findByInboxId(
      connection.inboxId as string,
    )

    const warning = await runConnectFollowUps(
      () => runMessengerFollowUps({ session, messengerRow }),
      {
        message:
          "Messenger connect follow-up failed after the page was connected",
      },
    )

    return connectedOutcome({
      sourceId: pageId,
      name,
      warning,
      integrationId: messengerRow.id,
      coexistEligible: true,
    })
  } catch (error) {
    return toConnectActionFailure(error, {
      sourceId: pageId,
      name,
      log: "Failed to connect a Messenger page",
    })
  }
}

async function runMessengerFollowUps({
  session,
  messengerRow,
}: {
  session: MessengerSession
  messengerRow: Awaited<
    ReturnType<typeof messengerIntegrationService.findByInboxId>
  >
}): Promise<void> {
  const { workspace, brandingMenuEntry } = session
  const auth = messengerRow.auth as MessengerAuthValue

  const brandingCtx = await buildContext({
    workspaceId: workspace.id,
    integrationType: "messenger",
    integration: { ...messengerRow, auth },
  })

  await integrationMessenger.runChannelHandler("bot", "addBranding", {
    ctx: brandingCtx,
    title: BRANDING_TITLE,
    url: brandingMenuEntry.url,
  })

  await updateWorkspaceLogo({
    id: workspace.id,
    integration: integrationMessenger,
    ctx: brandingCtx,
  })

  await tagSyncService.enqueueChannelScan({
    workspaceId: workspace.id,
    channelType: channelTypes.enum.messenger,
    integrationId: messengerRow.id,
  })
}
