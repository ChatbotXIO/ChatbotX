import "server-only"

import { instagramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import { runBrandingFollowUps } from "@/features/channel-connect/lib/branding-follow-ups"
import { connectSessionCandidate } from "@/features/channel-connect/lib/connect-session-candidate"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"

/**
 * Connects the single Instagram Business Login account from a
 * `ConnectSession`, as a plain server function so both transports can call
 * it: the oRPC route the picker posts to (`api/connect.ts`) and the server
 * action kept for any non-picker caller. Shares its whole skeleton with
 * `connectInstagramAccountViaFacebook` via `connectSessionCandidate`
 * (`channel-connect/lib/connect-session-candidate.ts`) — this file owns
 * only the Instagram-Business-Login-specific credential type and follow-up
 *   (no `persistIntegrationUserInfo`; `addBranding` is a live Graph push —
 *   `runInstagramFollowUps` also seeds `IntegrationInstagram
 *   .persistentMenus` with that same entry once the push succeeds, same as
 *   Messenger's `connect-page.ts`).
 */
export async function connectInstagramAccount(props: {
  userId: string
  sessionId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  return await connectSessionCandidate({
    userId: props.userId,
    sessionId: props.sessionId,
    targetId: props.igId,
    provider: "instagram",
    credentialType: "instagram",
    brandingChannel: "instagram",
    findRow: (inboxId) => instagramIntegrationService.findByInboxId(inboxId),
    runFollowUps: runInstagramFollowUps,
    followUpFailureMessage:
      "Instagram connect follow-up failed after the account was connected",
    connectFailureLog: "Failed to connect an Instagram account",
  })
}

async function runInstagramFollowUps({
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
    integration: integrationInstagram,
    integrationType: "instagram",
    persistBrandingMenu: instagramRow.persistentMenus.length
      ? undefined
      : (entry) =>
          instagramIntegrationService.seedPersistentMenu({
            id: instagramRow.id,
            entry,
          }),
  })
}
