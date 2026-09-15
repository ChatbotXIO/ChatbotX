import { connectionStateService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  channelHiddenException,
  connectionNotConfiguredException,
  connectSessionExpiredException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import {
  CONNECTION_REGISTRY,
  connectionService,
} from "@chatbotx.io/connections"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { sanitizeOptionalReturnUrl } from "@/lib/oauth-referer"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { toConnectSessionResource } from "../lib/connect-session-resource"
import { resolveOAuthCredential } from "../lib/resolve-connect-credential"
import {
  channelForProvider,
  listConnectionProviderResources,
  toConnectionResource,
} from "../lib/resolve-provider"
import {
  connectSessionTargetsRequest,
  createConnectionRequest,
  getConnectionRequest,
  getConnectSessionRequest,
  listConnectionProvidersRequest,
  listConnectionsRequest,
  reconnectConnectionRequest,
  submitConnectSessionInputRequest,
  updateConnectionRequest,
} from "../schema/request"

const listConnectionsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connections",
    summary: "List connections",
    tags: ["Connections"],
  })
  .input(listConnectionsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const { data } = await connectionStateService.list({
      workspaceId: input.workspaceId,
      kind: input.kind,
      provider: input.provider,
      channel: input.channel,
      status: input.status ? [input.status] : undefined,
      perPage: 50,
    })
    return { data: data.map(toConnectionResource) }
  })

const getConnectionAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connections/{id}",
    summary: "Get a connection",
    tags: ["Connections"],
  })
  .input(getConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const connection = await connectionStateService.getForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Connection not found")
    }
    return toConnectionResource(connection)
  })

const createConnectionAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connections",
    summary: "Connect a channel or integration",
    tags: ["Connections"],
  })
  .input(createConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ context, input }) => {
    const adapter = CONNECTION_REGISTRY[input.provider]
    if (!adapter) {
      throw connectionNotConfiguredException(input.provider)
    }

    const channel = channelForProvider(input.provider)
    if (channel) {
      const { data } = await connectionStateService.list({
        workspaceId: input.workspaceId,
        provider: input.provider,
        perPage: 1,
      })
      if (data.length === 0) {
        const policy = await resolveChannelPolicy(input.workspaceId)
        if (policy && !policy.visibleChannels.includes(channel)) {
          throw channelHiddenException(channel)
        }
      }
    }

    const isCredentialStrategy =
      adapter.provider.strategy === "token" ||
      adapter.provider.strategy === "api_key" ||
      adapter.provider.strategy === "self_serve"

    if (isCredentialStrategy) {
      const connection = await connectionService.connectFromCredentials({
        workspaceId: input.workspaceId,
        provider: input.provider,
        config: input.config ?? {},
        actorUserId: context.user.id,
      })
      return { connection: toConnectionResource(connection), session: null }
    }

    const ownerId = await resolvePlatformOwnerId({
      userId: context.user.id,
      workspaceId: input.workspaceId,
    })
    const resolved = await resolveOAuthCredential({
      provider: input.provider,
      ownerId,
    })
    if (!resolved) {
      throw connectionNotConfiguredException(input.provider)
    }
    const returnUrl = await sanitizeOptionalReturnUrl(input.redirectUrl)
    const { session } = await connectionService.startSession({
      workspaceId: input.workspaceId,
      provider: input.provider,
      purpose: "connect",
      credential: resolved.credential,
      callbackUrl: resolved.callbackUrl,
      actorUserId: context.user.id,
      platformOwnerId: ownerId,
      returnUrl,
    })
    return { connection: null, session: toConnectSessionResource(session) }
  })

const reconnectConnectionAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connections/{id}/reconnect",
    summary: "Re-authorize an existing connection",
    tags: ["Connections"],
  })
  .input(reconnectConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ context, input }) => {
    const connection = await connectionStateService.getForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Connection not found")
    }
    const ownerId = await resolvePlatformOwnerId({
      userId: context.user.id,
      workspaceId: input.workspaceId,
    })
    const resolved = await resolveOAuthCredential({
      provider: connection.provider,
      ownerId,
    })
    if (!resolved) {
      throw connectionNotConfiguredException(connection.provider)
    }
    const returnUrl = await sanitizeOptionalReturnUrl(input.redirectUrl)
    const { session } = await connectionService.reconnect({
      connectionId: input.id,
      workspaceId: input.workspaceId,
      credential: resolved.credential,
      callbackUrl: resolved.callbackUrl,
      actorUserId: context.user.id,
      platformOwnerId: ownerId,
      returnUrl,
    })
    return { connection: null, session: toConnectSessionResource(session) }
  })

const updateConnectionAPI = authorizedAPI
  .route({
    method: "PATCH",
    path: "/workspaces/{workspaceId}/connections/{id}",
    summary: "Rename a connection",
    tags: ["Connections"],
  })
  .input(updateConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const connection = await connectionStateService.updateDisplayName({
      id: input.id,
      workspaceId: input.workspaceId,
      displayName: input.displayName,
    })
    if (!connection) {
      throw notFoundException("Connection not found")
    }
    return toConnectionResource(connection)
  })

const disconnectConnectionAPI = authorizedAPI
  .route({
    method: "DELETE",
    path: "/workspaces/{workspaceId}/connections/{id}",
    summary: "Disconnect a connection",
    tags: ["Connections"],
  })
  .input(getConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const connection = await connectionService.disconnect({
      connectionId: input.id,
      workspaceId: input.workspaceId,
    })
    return toConnectionResource(connection)
  })

const refreshConnectionAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connections/{id}/refresh",
    summary: "Force-refresh a connection's auth",
    tags: ["Connections"],
  })
  .input(getConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const connection = await connectionService.refresh({
      connectionId: input.id,
      workspaceId: input.workspaceId,
    })
    return toConnectionResource(connection)
  })

const verifyConnectionAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connections/{id}/verify",
    summary: "Run a live health check on a connection",
    tags: ["Connections"],
  })
  .input(getConnectionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const connection = await connectionService.verify({
      connectionId: input.id,
      workspaceId: input.workspaceId,
    })
    return toConnectionResource(connection)
  })

const listConnectionProvidersAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connection-providers",
    summary: "List connection providers",
    tags: ["Connections"],
  })
  .input(listConnectionProvidersRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    // Support-session exemption from hidden-channel policy (the public
    // route's `isSupportSession` parameter) is not yet threaded through this
    // private path — deferred alongside the rest of the support-access
    // integration this feature doesn't otherwise touch.
    const data = await listConnectionProviderResources({
      workspaceId: input.workspaceId,
      kind: input.kind,
    })
    return { data }
  })

const getConnectSessionAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}",
    summary: "Get a connect session",
    tags: ["Connections"],
  })
  .input(getConnectSessionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const session = await connectSessionService.findByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!session) {
      throw notFoundException("Connect session not found")
    }
    return toConnectSessionResource(session)
  })

const connectSessionTargetsAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}/targets",
    summary: "Connect the selected targets of an awaiting_selection session",
    tags: ["Connections"],
  })
  .input(connectSessionTargetsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ context, input }) => {
    const result = await connectionService.connectTargets({
      sessionId: input.id,
      workspaceId: input.workspaceId,
      targetIds: input.targetIds,
      actorUserId: context.user.id,
    })
    return {
      session: toConnectSessionResource(result.session),
      connections: result.connections.map(toConnectionResource),
      outcomes: result.outcomes,
    }
  })

const submitConnectSessionInputAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}/input",
    summary: "Answer an enter_input step",
    tags: ["Connections"],
  })
  .input(submitConnectSessionInputRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const session = await connectSessionService.requireByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (session.nextAction?.type !== "enter_input") {
      throw connectSessionExpiredException(
        "This connect session is not awaiting input.",
      )
    }
    const updated = await connectSessionService.submitInput({
      id: session.id,
      nextAction: { type: "wait" },
    })
    return toConnectSessionResource(updated)
  })

const cancelConnectSessionAPI = authorizedAPI
  .route({
    method: "DELETE",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}",
    summary: "Cancel a connect session",
    tags: ["Connections"],
  })
  .input(getConnectSessionRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const session = await connectSessionService.cancel({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    return toConnectSessionResource(session)
  })

export const connectSessionsAPI = {
  getConnectSessionAPI,
  connectSessionTargetsAPI,
  submitConnectSessionInputAPI,
  cancelConnectSessionAPI,
}

export const connectionsAPI = {
  listConnectionsAPI,
  getConnectionAPI,
  createConnectionAPI,
  reconnectConnectionAPI,
  updateConnectionAPI,
  disconnectConnectionAPI,
  refreshConnectionAPI,
  verifyConnectionAPI,
  listConnectionProvidersAPI,
}
