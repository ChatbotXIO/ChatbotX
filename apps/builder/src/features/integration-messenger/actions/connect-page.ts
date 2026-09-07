import "server-only"

import {
  buildContext,
  messengerIntegrationService,
  tagSyncService,
} from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  getUserPages,
  integration as integrationMessenger,
} from "@chatbotx.io/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
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
import { FB_MESSENGER_PENDING_AUTH_COOKIE } from "@/lib/facebook-pending-auth"
import { persistIntegrationUserInfo } from "@/lib/integration-user-info"

type MessengerSession = ResolvedConnectSession<"messenger">

type MessengerPageCandidate = {
  pageId: string
  name: string
  pageAccessToken: string
}

/**
 * One Graph call per request, no cache — provider lists carry page access
 * tokens (plan §4.9).
 */
async function findConnectablePage({
  session,
  sourceId,
}: {
  session: MessengerSession
  sourceId: string
}): Promise<ConnectCandidateLookup<MessengerPageCandidate>> {
  const { pages } = await getUserPages(
    session.pendingAuth.userToken,
    session.pendingAuth.version,
  )
  const page = pages.find((candidate) => candidate.id === sourceId)

  if (!(page?.isConnectable && page.access_token)) {
    return unselectableCandidate(page?.name)
  }

  return selectableCandidate({
    pageId: page.id,
    name: page.name,
    pageAccessToken: page.access_token,
  })
}

async function isPageConnected(pageId: string): Promise<boolean> {
  const connectedPageIds =
    await messengerIntegrationService.findConnectedPageIds([pageId])
  return connectedPageIds.has(pageId)
}

async function subscribeAndPersistPage({
  session,
  candidate,
  actorUserId,
}: {
  session: MessengerSession
  candidate: MessengerPageCandidate
  actorUserId: string
}) {
  const { pendingAuth, workspace, platformOwnerId, brandingMenuEntry } = session
  const messengerSettings = session.credential.config
  const { pageId, name: pageName } = candidate

  const longLivedToken = await exchangeLongLivedToken(
    messengerSettings,
    candidate.pageAccessToken,
  )
  await subscribePageToAppWebhook({
    pageId,
    accessToken: longLivedToken,
    version: messengerSettings.version,
  })

  const auth: MessengerAuthValue = {
    authType: AuthType.oauth2,
    clientId: messengerSettings.clientId,
    clientSecret: messengerSettings.clientSecret,
    redirectUrl: "",
    version: messengerSettings.version,
    tokens: {
      accessToken: longLivedToken,
    },
    metadata: {
      pageId,
      pageName,
      version: messengerSettings.version,
    },
  }

  const { integrationId, integration } =
    await messengerIntegrationService.connectPage({
      actorUserId,
      ownerId: platformOwnerId,
      workspaceId: workspace.id,
      page: { pageId, pageName },
      auth,
      persistentMenus: [brandingMenuEntry],
    })

  return {
    integrationId,
    runFollowUps: async () => {
      const brandingCtx = await buildContext({
        workspaceId: workspace.id,
        integrationType: "messenger",
        integration: { ...integration, auth },
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

      await persistIntegrationUserInfo({
        workspaceId: workspace.id,
        userId: pendingAuth.userId,
        userName: pendingAuth.userName,
        userAccessToken: pendingAuth.userToken,
        avatarUrl: pendingAuth.userAvatarUrl,
        persist: (userInfo) =>
          messengerIntegrationService.updateUserInfo({
            id: integrationId,
            workspaceId: workspace.id,
            userInfo,
          }),
      })

      await tagSyncService.enqueueChannelScan({
        workspaceId: workspace.id,
        channelType: channelTypes.enum.messenger,
        integrationId,
      })
    },
  }
}

/**
 * Connects a single Facebook page, as a plain server function so both
 * transports can call it: the oRPC route the picker posts to in parallel
 * (`api/connect.ts`) and the server action kept for any non-picker caller.
 * The pending-auth cookie is the only source of the user token / workspace,
 * the id arrives on the wire alone, and every failure — session-level or
 * item-level — comes back as a typed `ConnectActionResult` instead of a
 * thrown exception. The skeleton around the Messenger-specific steps is
 * shared with both Instagram cores via `runConnectSequence`.
 */
export function connectMessengerPage({
  userId,
  pageId,
}: {
  userId: string
  pageId: string
}): Promise<ConnectActionResultWire> {
  return runConnectSequence({
    sourceId: pageId,
    session: {
      userId,
      cookieName: FB_MESSENGER_PENDING_AUTH_COOKIE,
      credentialType: "messenger",
      brandingChannel: "messenger",
    },
    lookUpCandidate: findConnectablePage,
    isAlreadyConnected: isPageConnected,
    connect: ({ session, candidate }) =>
      subscribeAndPersistPage({ session, candidate, actorUserId: userId }),
    logMessages: {
      followUpFailed:
        "Messenger connect follow-up failed after the page was connected",
      failed: "Failed to connect a Messenger page",
    },
  })
}
