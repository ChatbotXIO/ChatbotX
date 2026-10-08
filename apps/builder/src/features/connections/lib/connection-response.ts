import { connectionStateService } from "@chatbotx.io/business"
import type { SelfServeSecret } from "@chatbotx.io/connections"
import type {
  ChannelType,
  ConnectionKind,
  ConnectionStatus,
  ConnectSessionOutcome,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import { toConnectSessionResource } from "./connect-session-resource"
import { toConnectionResource } from "./resolve-provider"

/**
 * Shared `GET /v1/connections` / `GET /workspaces/{id}/connections` list
 * body — paginated `Connection` rows mapped to their public/private DTO.
 * Used by both `connectionsPublicRouter.list` (which additionally resolves
 * `kind` from the caller's token scope before calling this) and private's
 * `listConnectionsAPI`.
 */
export const listConnectionResources = async (input: {
  workspaceId: string
  kind?: ConnectionKind
  provider?: IntegrationType
  channel?: ChannelType
  status?: ConnectionStatus
  page: number
  perPage: number
}) => {
  const { data, count } = await connectionStateService.list({
    workspaceId: input.workspaceId,
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
}

/**
 * Shared `POST /v1/connections` / `POST /v1/connections/{id}/reconnect`
 * response envelope mapper — exactly one of `connection`/`session` is
 * non-null on `result`, mirroring `startConnect`/`startReconnect`'s
 * contract (`lib/connect-flow.ts`).
 */
export const toConnectEnvelope = (result: {
  connection: ConnectionModel | null
  session: ConnectSessionModel | null
  secret?: SelfServeSecret | null
}) => ({
  connection: result.connection
    ? toConnectionResource(result.connection)
    : null,
  session: result.session ? toConnectSessionResource(result.session) : null,
  secret: result.secret ?? null,
})

/** Shared `POST /v1/connect-sessions/{id}/targets` response mapper. */
export const toConnectTargetsResource = (result: {
  session: ConnectSessionModel
  connections: ConnectionModel[]
  outcomes: ConnectSessionOutcome[]
}) => ({
  session: toConnectSessionResource(result.session),
  connections: result.connections.map(toConnectionResource),
  outcomes: result.outcomes,
})
