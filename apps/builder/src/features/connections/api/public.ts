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
import { sanitizeOptionalReturnUrl } from "@/lib/oauth-referer"
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
  possibleErrorsOnSubmittingConnectSessionInput,
  possibleErrorsOnUpdatingConnection,
  possibleErrorsOnVerifyingConnection,
} from "@/lib/orpc/orpc-error-helper"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { publicListResponse, withPublicPaging } from "@/lib/public-api/list"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
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
import {
  connectEnvelope,
  connectionProviderResource,
  connectionResource,
  connectSessionResource,
  connectSessionTargetsResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("connections")

export const connectionsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/connections",
      summary: "List connections",
      description:
        "Every channel and integration connection in the workspace — the unified successor to /v1/integrations and the channel-specific list endpoints. Ordered by kind, then provider, then display name.",
      tags: ["Connections"],
    })
    .input(withPublicPaging(listConnectionsRequest))
    .output(publicListResponse(connectionResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, count } = await connectionStateService.list({
        workspaceId: context.workspace.id,
        kind: input.kind,
        provider: input.provider,
        channel: input.channel,
        status: input.status ? [input.status] : undefined,
        page: input.page,
        perPage: input.perPage,
      })
      return {
        data: data.map(toConnectionResource),
        pageCount: Math.max(1, Math.ceil(count / input.perPage)),
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/connections/{id}",
      summary: "Get a connection",
      tags: ["Connections"],
    })
    .input(getConnectionRequest)
    .output(connectionResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const connection = await connectionStateService.getForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!connection) {
        throw notFoundException("Connection not found")
      }
      return toConnectionResource(connection)
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connections",
      successStatus: 201,
      summary: "Connect a channel or integration",
      description:
        'Credential-strategy providers (`token`/`api_key`/`self_serve`) connect immediately and return `connection` (`session: null`). OAuth providers (`oauth_redirect`/`oauth_popup`) return `connection: null` and a `session` whose `nextAction` is `{type:"open_url", url}` — show that URL to the person connecting, then poll `GET /v1/connect-sessions/{id}` until `awaiting_selection` (a multi-account provider) or `completed` (a single-account provider), then call `POST /v1/connect-sessions/{id}/targets` to finish a multi-account connect. The person opening the URL must have admin rights on the account being connected: the resulting token belongs to them, so hand each person their own link — a leaked URL can only connect the opener\'s account into this workspace.',
      tags: ["Connections"],
    })
    .input(createConnectionRequest)
    .output(connectEnvelope)
    .errors(possibleErrorsOnCreatingConnection)
    .handler(async ({ context, input }) => {
      const adapter = CONNECTION_REGISTRY[input.provider]
      if (!adapter) {
        throw connectionNotConfiguredException(input.provider)
      }

      const channel = channelForProvider(input.provider)
      if (channel) {
        const { data } = await connectionStateService.list({
          workspaceId: context.workspace.id,
          provider: input.provider,
          perPage: 1,
        })
        if (data.length === 0) {
          const policy = await resolveChannelPolicy(context.workspace.id)
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
          workspaceId: context.workspace.id,
          provider: input.provider,
          config: input.config ?? {},
        })
        return { connection: toConnectionResource(connection), session: null }
      }

      const ownerId = await resolveOwnerForWorkspace(context.workspace)
      const resolved = await resolveOAuthCredential({
        provider: input.provider,
        ownerId,
      })
      if (!resolved) {
        throw connectionNotConfiguredException(input.provider)
      }
      const returnUrl = await sanitizeOptionalReturnUrl(input.redirectUrl)
      const { session } = await connectionService.startSession({
        workspaceId: context.workspace.id,
        provider: input.provider,
        purpose: "connect",
        credential: resolved.credential,
        callbackUrl: resolved.callbackUrl,
        actorTokenId: context.apiToken.id,
        platformOwnerId: ownerId,
        returnUrl,
      })
      return { connection: null, session: toConnectSessionResource(session) }
    }),

  reconnect: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connections/{id}/reconnect",
      successStatus: 201,
      summary: "Re-authorize an existing connection",
      description:
        "Starts a new OAuth authorization for this exact connection (typically after it went `needs_reauth`). The re-granted account must match the one being reconnected, or the attempt fails once the browser round trip completes. Same envelope as `POST /v1/connections`; `connection` is always `null` here — a reconnect never resolves without the round trip.",
      tags: ["Connections"],
    })
    .input(reconnectConnectionRequest)
    .output(connectEnvelope)
    .errors(possibleErrorsOnReconnectingConnection)
    .handler(async ({ context, input }) => {
      const connection = await connectionStateService.getForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!connection) {
        throw notFoundException("Connection not found")
      }
      const ownerId = await resolveOwnerForWorkspace(context.workspace)
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
        workspaceId: context.workspace.id,
        credential: resolved.credential,
        callbackUrl: resolved.callbackUrl,
        actorTokenId: context.apiToken.id,
        platformOwnerId: ownerId,
        returnUrl,
      })
      return { connection: null, session: toConnectSessionResource(session) }
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/connections/{id}",
      summary: "Rename a connection",
      description:
        "Updates the connection's display name only — provider configuration stays on provider-specific routes.",
      tags: ["Connections"],
    })
    .input(updateConnectionRequest)
    .output(connectionResource)
    .errors(possibleErrorsOnUpdatingConnection)
    .handler(async ({ context, input }) => {
      const connection = await connectionStateService.updateDisplayName({
        id: input.id,
        workspaceId: context.workspace.id,
        displayName: input.displayName,
      })
      if (!connection) {
        throw notFoundException("Connection not found")
      }
      return toConnectionResource(connection)
    }),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/connections/{id}",
      summary: "Disconnect a connection",
      description:
        "Best-effort provider-side teardown (revoke/unsubscribe), then marks the connection disconnected. Never fails the local disconnect on an upstream API error.",
      tags: ["Connections"],
    })
    .input(getConnectionRequest)
    .output(connectionResource)
    .errors(possibleErrorsOnDisconnectingConnection)
    .handler(async ({ context, input }) => {
      const connection = await connectionService.disconnect({
        connectionId: input.id,
        workspaceId: context.workspace.id,
      })
      return toConnectionResource(connection)
    }),

  refresh: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connections/{id}/refresh",
      summary: "Force-refresh a connection's auth",
      description:
        "Calls the provider's token refresh regardless of expiry. 409 if the connection is not active; 400 if the provider does not support refresh.",
      tags: ["Connections"],
    })
    .input(getConnectionRequest)
    .output(connectionResource)
    .errors(possibleErrorsOnRefreshingConnection)
    .handler(async ({ context, input }) => {
      const connection = await connectionService.refresh({
        connectionId: input.id,
        workspaceId: context.workspace.id,
      })
      return toConnectionResource(connection)
    }),

  verify: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connections/{id}/verify",
      summary: "Run a live health check on a connection",
      description:
        "Calls the provider's health check without refreshing auth, and updates the connection's status from the result. 409 if the connection is not active.",
      tags: ["Connections"],
    })
    .input(getConnectionRequest)
    .output(connectionResource)
    .errors(possibleErrorsOnVerifyingConnection)
    .handler(async ({ context, input }) => {
      const connection = await connectionService.verify({
        connectionId: input.id,
        workspaceId: context.workspace.id,
      })
      return toConnectionResource(connection)
    }),
}

export const connectionProvidersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/connection-providers",
      summary: "List connection providers",
      description:
        "The full connect catalog — every provider's strategy, config fields, and whether this workspace can connect it right now. Use `configFields` to build the `config` object for `POST /v1/connections`.",
      tags: ["Connections"],
    })
    .input(listConnectionProvidersRequest)
    .output(publicListResponse(connectionProviderResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await listConnectionProviderResources({
        workspaceId: context.workspace.id,
        kind: input.kind,
      })
      return { data, pageCount: 1 }
    }),
}

export const connectSessionsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/connect-sessions/{id}",
      summary: "Get a connect session",
      description:
        "Poll this after `POST /v1/connections`/`POST /v1/connections/{id}/reconnect` returns a `session`. `status` moves `pending` -> `awaiting_selection` (multi-account) or straight to `completed` (single-account) once the OAuth round trip finishes, or `failed`/`expired`/`cancelled`. Clients must tolerate unknown future values in `status`/`nextAction.type`.",
      tags: ["Connections"],
    })
    .input(getConnectSessionRequest)
    .output(connectSessionResource)
    .errors(possibleErrorsOnFindingConnectSession)
    .handler(async ({ context, input }) => {
      const session = await connectSessionService.findByIdForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!session) {
        throw notFoundException("Connect session not found")
      }
      return toConnectSessionResource(session)
    }),

  connectTargets: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connect-sessions/{id}/targets",
      summary: "Connect the selected targets of an awaiting_selection session",
      description:
        "Finishes a multi-account OAuth connect: claims and connects each requested target, one outcome per target (`connected`/`duplicated`/`limitReached`/`failed` — never throws for a single target's failure). 400 if the session is not `awaiting_selection`.",
      tags: ["Connections"],
    })
    .input(connectSessionTargetsRequest)
    .output(connectSessionTargetsResource)
    .errors(possibleErrorsOnConnectingSessionTargets)
    .handler(async ({ context, input }) => {
      const result = await connectionService.connectTargets({
        sessionId: input.id,
        workspaceId: context.workspace.id,
        targetIds: input.targetIds,
      })
      return {
        session: toConnectSessionResource(result.session),
        connections: result.connections.map(toConnectionResource),
        outcomes: result.outcomes,
      }
    }),

  submitInput: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/connect-sessions/{id}/input",
      summary: "Answer an enter_input step",
      description:
        "Answers a session whose `nextAction.type` is `enter_input` (e.g. a future WhatsApp registration PIN step). No v1 provider produces an `enter_input` step yet — this route ships so clients are already written against the full protocol. 400 if the session is not currently awaiting input.",
      tags: ["Connections"],
    })
    .input(submitConnectSessionInputRequest)
    .output(connectSessionResource)
    .errors(possibleErrorsOnSubmittingConnectSessionInput)
    .handler(async ({ context, input }) => {
      const session = await connectSessionService.requireByIdForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (session.nextAction?.type !== "enter_input") {
        throw connectSessionExpiredException(
          "This connect session is not awaiting input.",
        )
      }
      // No v1 provider strategy defines an `enter_input` handler yet, so
      // this path never runs in practice today (`nextAction.type` is
      // never `enter_input` above) — kept minimal (acknowledge, then wait)
      // so the shape is stable for whichever future strategy needs it.
      const updated = await connectSessionService.submitInput({
        id: session.id,
        nextAction: { type: "wait" },
      })
      return toConnectSessionResource(updated)
    }),

  cancel: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/connect-sessions/{id}",
      summary: "Cancel a connect session",
      tags: ["Connections"],
    })
    .input(getConnectSessionRequest)
    .output(connectSessionResource)
    .errors(possibleErrorsOnCancelingConnectSession)
    .handler(async ({ context, input }) => {
      const session = await connectSessionService.cancel({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      return toConnectSessionResource(session)
    }),
}
