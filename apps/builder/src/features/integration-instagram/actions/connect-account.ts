import "server-only"

import {
  buildContext,
  type instagramIntegrationService,
} from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import { BRANDING_TITLE } from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { connectInstagramCandidate } from "./connect-account-core"

type InstagramSession = ResolvedConnectSession<"instagram">

/**
 * Connects the single Instagram Business Login account from a
 * `ConnectSession`, as a plain server function so both transports can call
 * it: the oRPC route the picker posts to (`api/connect.ts`) and the server
 * action kept for any non-picker caller. Shares its whole skeleton with
 * `connectInstagramAccountViaFacebook` via `connectInstagramCandidate`
 * (`connect-account-core.ts`) — this file owns only the Instagram-
 * Business-Login-specific credential type and follow-up (no
 * `persistIntegrationUserInfo`; `addBranding` is a live Graph push, not a DB
 * write, so `IntegrationInstagram.persistentMenus` stays at its default).
 */
export async function connectInstagramAccount(props: {
  userId: string
  sessionId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  return await connectInstagramCandidate({
    ...props,
    credentialType: "instagram",
    runFollowUps: runInstagramFollowUps,
    followUpFailureMessage:
      "Instagram connect follow-up failed after the account was connected",
    connectFailureLog: "Failed to connect an Instagram account",
  })
}

async function runInstagramFollowUps({
  session,
  instagramRow,
}: {
  session: InstagramSession
  instagramRow: Awaited<
    ReturnType<typeof instagramIntegrationService.findByInboxId>
  >
}): Promise<void> {
  const { workspace, brandingMenuEntry } = session
  const auth = instagramRow.auth as InstagramAuthValue

  const brandingCtx = await buildContext({
    workspaceId: workspace.id,
    integrationType: "instagram",
    integration: { ...instagramRow, auth },
  })

  await integrationInstagram.runChannelHandler("bot", "addBranding", {
    ctx: brandingCtx,
    title: BRANDING_TITLE,
    url: brandingMenuEntry.url,
  })

  await updateWorkspaceLogo({
    id: workspace.id,
    integration: integrationInstagram,
    ctx: brandingCtx,
  })
}
