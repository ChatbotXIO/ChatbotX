import "server-only"

import {
  buildContext,
  type instagramIntegrationService,
} from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import { BRANDING_TITLE } from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { connectInstagramCandidate } from "./connect-account-core"

type InstagramFacebookSession = ResolvedConnectSession<"instagramFacebook">

/**
 * Connects one Instagram account (via its linked Facebook Page) from a
 * `ConnectSession`, as a plain server function so both transports can call
 * it: the oRPC route the picker posts to in parallel (`api/connect.ts`) and
 * the server action kept for any non-picker caller. Shares its whole
 * skeleton with `connectInstagramAccount` via `connectInstagramCandidate`
 * (`connect-account-core.ts`) — this file owns only the via-Facebook
 * credential type and follow-up (different Meta app/package than the
 * Business Login variant).
 */
export async function connectInstagramAccountViaFacebook(props: {
  userId: string
  sessionId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  return await connectInstagramCandidate({
    ...props,
    credentialType: "instagramFacebook",
    runFollowUps: runInstagramFacebookFollowUps,
    followUpFailureMessage:
      "Instagram (via Facebook) connect follow-up failed after the account was connected",
    connectFailureLog: "Failed to connect an Instagram account via Facebook",
  })
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
