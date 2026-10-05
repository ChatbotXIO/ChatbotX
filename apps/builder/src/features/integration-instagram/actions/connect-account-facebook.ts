import "server-only"

import { instagramIntegrationService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import { runBrandingFollowUps } from "@/features/channel-connect/lib/branding-follow-ups"
import { connectSessionCandidate } from "@/features/channel-connect/lib/connect-session-candidate"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"

/**
 * Connects one Instagram account (via its linked Facebook Page) from a
 * `ConnectSession`, as a plain server function so both transports can call
 * it: the oRPC route the picker posts to in parallel (`api/connect.ts`) and
 * the server action kept for any non-picker caller. Shares its whole
 * skeleton with `connectInstagramAccount` via `connectSessionCandidate`
 * (`channel-connect/lib/connect-session-candidate.ts`) — this file owns
 * only the via-Facebook credential type and follow-up (different Meta
 * app/package than the Business Login variant).
 */
export async function connectInstagramAccountViaFacebook(props: {
  userId: string
  sessionId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  return await connectSessionCandidate({
    userId: props.userId,
    sessionId: props.sessionId,
    targetId: props.igId,
    provider: "instagramFacebook",
    credentialType: "instagramFacebook",
    brandingChannel: "instagram",
    findRow: (inboxId) => instagramIntegrationService.findByInboxId(inboxId),
    runFollowUps: runInstagramFacebookFollowUps,
    followUpFailureMessage:
      "Instagram (via Facebook) connect follow-up failed after the account was connected",
    connectFailureLog: "Failed to connect an Instagram account via Facebook",
  })
}

async function runInstagramFacebookFollowUps({
  session,
  row: instagramRow,
}: {
  session: ResolvedConnectSession
  row: IntegrationInstagramModel
}): Promise<void> {
  const auth = instagramRow.auth as InstagramAuthValue

  await runBrandingFollowUps({
    session,
    integrationRow: { ...instagramRow, auth },
    integration: integrationInstagramFacebook,
    integrationType: "instagramFacebook",
    persistBrandingMenu: instagramRow.persistentMenus.length
      ? undefined
      : async (entry) => {
          await db
            .update(integrationInstagramModel)
            .set({ persistentMenus: [entry] })
            .where(eq(integrationInstagramModel.id, instagramRow.id))
        },
  })
}
