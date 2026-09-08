import "server-only"

import {
  buildContext,
  instagramIntegrationService,
} from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import {
  getUserInstagramAccounts,
  integration as integrationInstagramFacebook,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram-facebook"
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
import { FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE } from "@/lib/facebook-pending-auth"
import { persistIntegrationUserInfo } from "@/lib/integration-user-info"
import { isInstagramAccountConnected } from "./connect-account-shared"

type InstagramFacebookSession = ResolvedConnectSession<"instagramFacebook">

type LinkedInstagramAccount = {
  id: string
  name: string
  username: string
  pageId: string
  pageAccessToken: string
}

/**
 * One Graph call per request, no cache — provider lists carry page access
 * tokens (plan §4.9).
 */
async function findLinkedAccount({
  session,
  sourceId,
}: {
  session: InstagramFacebookSession
  sourceId: string
}): Promise<ConnectCandidateLookup<LinkedInstagramAccount>> {
  const accounts = await getUserInstagramAccounts(
    session.pendingAuth.userToken,
    session.pendingAuth.version,
  )
  const account = accounts.find((candidate) => candidate.id === sourceId)

  return account ? selectableCandidate(account) : unselectableCandidate()
}

async function subscribeAndPersistAccount({
  session,
  candidate: account,
  actorUserId,
}: {
  session: InstagramFacebookSession
  candidate: LinkedInstagramAccount
  actorUserId: string
}) {
  const { pendingAuth, workspace, platformOwnerId, brandingMenuEntry } = session
  const instagramSettings = session.credential.config

  await subscribePageToInstagramWebhook({
    pageId: account.pageId,
    accessToken: account.pageAccessToken,
    version: pendingAuth.version,
  })

  const auth: InstagramAuthValue = {
    authType: AuthType.oauth2,
    clientId: instagramSettings.clientId,
    clientSecret: instagramSettings.clientSecret,
    redirectUrl: "",
    tokens: {
      accessToken: account.pageAccessToken,
    },
    metadata: {
      igId: account.id,
      igName: account.name,
      pageId: account.pageId,
      version: pendingAuth.version,
    },
  }

  const { integrationId, integration } =
    await instagramIntegrationService.connectAccount({
      actorUserId,
      ownerId: platformOwnerId,
      workspaceId: workspace.id,
      type: "facebook",
      account: {
        igId: account.id,
        igName: account.name,
        igUsername: account.username,
        pageId: account.pageId,
      },
      auth,
      persistentMenus: [brandingMenuEntry],
    })

  return {
    integrationId,
    runFollowUps: async () => {
      const brandingCtx = await buildContext({
        workspaceId: workspace.id,
        integrationType: "instagramFacebook",
        integration: { ...integration, auth },
      })

      await integrationInstagramFacebook.runChannelHandler(
        "bot",
        "addBranding",
        {
          ctx: brandingCtx,
          title: BRANDING_TITLE,
          url: brandingMenuEntry.url,
        },
      )

      await updateWorkspaceLogo({
        id: workspace.id,
        integration: integrationInstagramFacebook,
        ctx: brandingCtx,
      })

      await persistIntegrationUserInfo({
        workspaceId: workspace.id,
        userId: pendingAuth.userId,
        userName: pendingAuth.userName,
        userAccessToken: pendingAuth.userToken,
        avatarUrl: pendingAuth.userAvatarUrl,
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
 * Connects a single Instagram account via its linked Facebook Page, as a
 * plain server function so both transports can call it: the oRPC route the
 * picker posts to in parallel (`api/connect.ts`) and the server action kept
 * for any non-picker caller. Same skeleton as Messenger's
 * `connectMessengerPage`: the pending-auth cookie is the only source of the
 * user token / workspace, the id arrives on the wire alone, and every failure
 * comes back as a typed `ConnectActionResult` instead of a thrown exception.
 */
export function connectInstagramAccountViaFacebook({
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
      cookieName: FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
      credentialType: "instagramFacebook",
      brandingChannel: "instagram",
    },
    lookUpCandidate: findLinkedAccount,
    isAlreadyConnected: isInstagramAccountConnected,
    connect: ({ session, candidate }) =>
      subscribeAndPersistAccount({ session, candidate, actorUserId: userId }),
    logMessages: {
      followUpFailed:
        "Instagram (via Facebook) connect follow-up failed after the account was connected",
      failed: "Failed to connect an Instagram account via Facebook",
    },
  })
}
