import { connectionStateService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { notFoundException } from "@chatbotx.io/business/errors"
import { connectionService } from "@chatbotx.io/connections"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import {
  possibleErrorsOnCancelingConnectSession,
  possibleErrorsOnConnectingSessionTargets,
  possibleErrorsOnCreatingConnection,
  possibleErrorsOnDisconnectingConnection,
  possibleErrorsOnFindingConnectSession,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnReconnectingConnection,
  possibleErrorsOnRefreshingConnection,
  possibleErrorsOnUpdatingConnection,
  possibleErrorsOnVerifyingConnection,
} from "@/lib/orpc/orpc-error-helper"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { publicListResponse, withPublicPaging } from "@/lib/public-api/list"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { startConnect, startReconnect } from "../lib/connect-flow"
import { toConnectSessionResource } from "../lib/connect-session-resource"
import {
  listConnectionResources,
  toConnectEnvelope,
  toConnectTargetsResource,
} from "../lib/connection-response"
import {
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
  updateConnectionRequest,
} from "../schema/request"
import {
  connectEnvelope,
  connectionProviderResource,
  connectionResource,
  connectSessionResource,
  connectSessionTargetsResource,
} from "../schema/resource"

const listConnectionsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connections",
    summary: "List connections",
    tags: ["Connections"],
  })
  .input(withPublicPaging(listConnectionsRequest).and(withWorkspaceIdSchema))
  .output(publicListResponse(connectionResource))
  .errors(possibleErrorsOnListingResource)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(({ input }) =>
    listConnectionResources({
      workspaceId: input.workspaceId,
      kind: input.kind,
      provider: input.provider,
      channel: input.channel,
      status: input.status,
      page: input.page,
      perPage: input.perPage,
    }),
  )

const getConnectionAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connections/{id}",
    summary: "Get a connection",
    tags: ["Connections"],
  })
  .input(getConnectionRequest.and(withWorkspaceIdSchema))
  .output(connectionResource)
  .errors(possibleErrorsOnFindingResource)
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
  .output(connectEnvelope)
  .errors(possibleErrorsOnCreatingConnection)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ context, input }) => {
    const ownerId = await resolvePlatformOwnerId({
      userId: context.user.id,
      workspaceId: input.workspaceId,
    })
    const result = await startConnect({
      workspaceId: input.workspaceId,
      provider: input.provider,
      config: input.config,
      redirectUrl: input.redirectUrl,
      ownerId,
      actor: { actorUserId: context.user.id },
    })
    return toConnectEnvelope(result)
  })

const reconnectConnectionAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/connections/{id}/reconnect",
    summary: "Re-authorize an existing connection",
    tags: ["Connections"],
  })
  .input(reconnectConnectionRequest.and(withWorkspaceIdSchema))
  .output(connectEnvelope)
  .errors(possibleErrorsOnReconnectingConnection)
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
    const { session } = await startReconnect({
      connection,
      workspaceId: input.workspaceId,
      redirectUrl: input.redirectUrl,
      ownerId,
      actor: { actorUserId: context.user.id },
    })
    return toConnectEnvelope({ connection: null, session })
  })

const updateConnectionAPI = authorizedAPI
  .route({
    method: "PUT",
    path: "/workspaces/{workspaceId}/connections/{id}",
    summary: "Rename a connection",
    tags: ["Connections"],
  })
  .input(updateConnectionRequest.and(withWorkspaceIdSchema))
  .output(connectionResource)
  .errors(possibleErrorsOnUpdatingConnection)
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
  .output(connectionResource)
  .errors(possibleErrorsOnDisconnectingConnection)
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
  .output(connectionResource)
  .errors(possibleErrorsOnRefreshingConnection)
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
  .output(connectionResource)
  .errors(possibleErrorsOnVerifyingConnection)
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
  .output(publicListResponse(connectionProviderResource))
  .errors(possibleErrorsOnListingResource)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const data = await listConnectionProviderResources({
      workspaceId: input.workspaceId,
      kind: input.kind,
    })
    return { data, pageCount: 1 }
  })

const getConnectSessionAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}",
    summary: "Get a connect session",
    tags: ["Connections"],
  })
  .input(getConnectSessionRequest.and(withWorkspaceIdSchema))
  .output(connectSessionResource)
  .errors(possibleErrorsOnFindingConnectSession)
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
  .output(connectSessionTargetsResource)
  .errors(possibleErrorsOnConnectingSessionTargets)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ context, input }) => {
    const result = await connectionService.connectTargets({
      sessionId: input.id,
      workspaceId: input.workspaceId,
      targetIds: input.targetIds,
      actorUserId: context.user.id,
    })
    return toConnectTargetsResource(result)
  })

const cancelConnectSessionAPI = authorizedAPI
  .route({
    method: "DELETE",
    path: "/workspaces/{workspaceId}/connect-sessions/{id}",
    summary: "Cancel a connect session",
    tags: ["Connections"],
  })
  .input(getConnectSessionRequest.and(withWorkspaceIdSchema))
  .output(connectSessionResource)
  .errors(possibleErrorsOnCancelingConnectSession)
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
