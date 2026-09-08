import "server-only"

import {
  buildContext,
  instagramIntegrationService,
} from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
  getInstagramAccount,
  integration as integrationInstagram,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { AuthType } from "@chatbotx.io/sdk"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import {
  type ConnectCandidateLookup,
  runConnectSequence,
  selectableCandidate,
  unselectableCandidate,
} from "@/features/channel-connect/lib/run-connect-sequence"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import { BRANDING_TITLE } from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { FB_INSTAGRAM_PENDING_AUTH_COOKIE } from "@/lib/facebook-pending-auth"
import { persistIntegrationUserInfo } from "@/lib/integration-user-info"
import { isInstagramAccountConnected } from "./connect-account-shared"

type InstagramSession = ResolvedConnectSession<"instagram">

type BusinessLoginAccount = {
  /** The Instagram Business Login page id. */
  id: string
  /** The Instagram account id — the `igId` the picker sends on the wire. */
  userId: string
  name: string
  username: string
  accessToken: string
  profile_picture_url?: string
}

/**
 * Re-resolves the account server-side. The picker only ever offers one
 * Instagram Business Login account per session, so `sourceId` here is a
 * cross-check against what the provider actually returns, not a lookup key.
 */
async function findAuthorizedAccount({
  session,
  sourceId,
}: {
  session: InstagramSession
  sourceId: string
}): Promise<ConnectCandidateLookup<BusinessLoginAccount>> {
  const account = await getInstagramAccount(session.pendingAuth.userToken)

  return account && account.userId === sourceId
    ? selectableCandidate(account)
    : unselectableCandidate()
}

async function subscribeAndPersistAccount({
  session,
  candidate: account,
  actorUserId,
}: {
  session: InstagramSession
  candidate: BusinessLoginAccount
  actorUserId: string
}) {
  const { workspace, platformOwnerId, brandingMenuEntry } = session
  const instagramSettings = session.credential.config

  await subscribePageToInstagramWebhook({
    igId: account.id,
    accessToken: account.accessToken,
    version: instagramSettings.version,
  })

  const auth: InstagramAuthValue = {
    authType: AuthType.oauth2,
    clientId: instagramSettings.clientId,
    clientSecret: instagramSettings.clientSecret,
    redirectUrl: "",
    tokens: {
      accessToken: account.accessToken,
    },
    metadata: {
      igId: account.userId,
      igName: account.name,
      pageId: account.id,
      version: instagramSettings.version,
    },
  }

  const { integrationId, integration } =
    await instagramIntegrationService.connectAccount({
      actorUserId,
      ownerId: platformOwnerId,
      workspaceId: workspace.id,
      type: "instagram",
      account: {
        igId: account.userId,
        igName: account.name,
        igUsername: account.username,
        pageId: account.id,
      },
      auth,
      persistentMenus: [brandingMenuEntry],
    })

  return {
    integrationId,
    runFollowUps: async () => {
      const brandingCtx = await buildContext({
        workspaceId: workspace.id,
        integrationType: "instagram",
        integration: { ...integration, auth },
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

      // Direct Instagram login authenticates as the account itself, so the
      // account IS the user — no extra Graph identity call needed.
      await persistIntegrationUserInfo({
        workspaceId: workspace.id,
        userId: account.userId,
        userName: account.name,
        userAccessToken: account.accessToken,
        avatarUrl: account.profile_picture_url,
        persist: (userInfo) =>
          instagramIntegrationService.updateUserInfo({
            id: integrationId,
            workspaceId: workspace.id,
            userInfo,
          }),
      })
    },
  }
}

/**
 * Connects the single Instagram Business Login account authorized by the
 * pending OAuth session, as a plain server function so both transports can
 * call it: the oRPC route the picker posts to (`api/connect.ts`) and the
 * server action kept for any non-picker caller. Same session/item-outcome
 * contract as `connectMessengerPage` and
 * `connectInstagramAccountViaFacebook` (plan §2.4/§3.3).
 */
export function connectInstagramAccount({
  userId,
  igId,
}: {
  userId: string
  igId: string
}): Promise<ConnectActionResultWire> {
  return runConnectSequence({
    sourceId: igId,
    session: {
      userId,
      cookieName: FB_INSTAGRAM_PENDING_AUTH_COOKIE,
      credentialType: "instagram",
      brandingChannel: "instagram",
    },
    lookUpCandidate: findAuthorizedAccount,
    isAlreadyConnected: isInstagramAccountConnected,
    connect: ({ session, candidate }) =>
      subscribeAndPersistAccount({ session, candidate, actorUserId: userId }),
    logMessages: {
      followUpFailed:
        "Instagram connect follow-up failed after the account was connected",
      failed: "Failed to connect an Instagram account",
    },
  })
}
