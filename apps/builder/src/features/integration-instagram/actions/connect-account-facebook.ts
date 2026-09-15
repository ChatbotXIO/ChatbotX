import "server-only"

import {
  buildContext,
  instagramIntegrationService,
} from "@chatbotx.io/business"
import { connectionService } from "@chatbotx.io/connections"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
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

type InstagramFacebookSession = ResolvedConnectSession<"instagramFacebook">

/**
 * Connects one Instagram account (via its linked Facebook Page) from a
 * `ConnectSession`, as a plain server function so both transports can call
 * it: the oRPC route the picker posts to in parallel (`api/connect.ts`) and
 * the server action kept for any non-picker caller. Same skeleton and the
 * same two accepted scope reductions as `connectMessengerPage`.
 */
export async function connectInstagramAccountViaFacebook({
  userId,
  sessionId,
  igId,
}: {
  userId: string
  sessionId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  let name = igId

  try {
    const session = await resolveConnectSession({
      userId,
      sessionId,
      credentialType: "instagramFacebook",
      brandingChannel: "instagram",
    })

    const target = session.session.targets.find((t) => t.id === igId)
    if (!target) {
      return notSelectableOutcome({ sourceId: igId, name })
    }
    name = target.name

    if (!target.selectable) {
      return target.alreadyConnected
        ? duplicatedOutcome({ sourceId: igId, name })
        : notSelectableOutcome({ sourceId: igId, name })
    }

    const result = await connectionService.connectTargets({
      sessionId,
      workspaceId: session.workspace.id,
      targetIds: [igId],
      actorUserId: userId,
    })
    const outcome = result.outcomes[0]
    const connection = result.connections[0]

    if (!(outcome && outcome.status === "connected" && connection)) {
      return {
        kind: "outcome",
        outcome: {
          sourceId: igId,
          name,
          status: outcome?.status ?? "failed",
          reason: outcome?.reason ?? "unknown",
          detail: outcome?.detail,
          coexistEligible: false,
        },
      }
    }

    const instagramRow = await instagramIntegrationService.findByInboxId(
      connection.inboxId as string,
    )

    const warning = await runConnectFollowUps(
      () => runInstagramFacebookFollowUps({ session, instagramRow }),
      {
        message:
          "Instagram (via Facebook) connect follow-up failed after the account was connected",
      },
    )

    return connectedOutcome({
      sourceId: igId,
      name,
      warning,
      integrationId: instagramRow.id,
      coexistEligible: true,
    })
  } catch (error) {
    return toConnectActionFailure(error, {
      sourceId: igId,
      name,
      log: "Failed to connect an Instagram account via Facebook",
    })
  }
}

async function runInstagramFacebookFollowUps({
  session,
  instagramRow,
}: {
  session: InstagramFacebookSession
  instagramRow: Awaited<
    ReturnType<typeof instagramIntegrationService.findByInboxId>
  >
}): Promise<void> {
  const { workspace, brandingMenuEntry } = session
  const auth = instagramRow.auth as InstagramAuthValue

  const brandingCtx = await buildContext({
    workspaceId: workspace.id,
    integrationType: "instagramFacebook",
    integration: { ...instagramRow, auth },
  })

  await integrationInstagramFacebook.runChannelHandler("bot", "addBranding", {
    ctx: brandingCtx,
    title: BRANDING_TITLE,
    url: brandingMenuEntry.url,
  })

  await updateWorkspaceLogo({
    id: workspace.id,
    integration: integrationInstagramFacebook,
    ctx: brandingCtx,
  })
}
