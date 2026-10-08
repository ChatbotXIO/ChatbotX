import {
  apiConnectConfigSchema,
  integrationApiService,
  integrationWebchatService,
  webchatConnectConfigSchema,
} from "@chatbotx.io/business"
import { resolveOwnerId } from "@chatbotx.io/business/connection"
import {
  connectionWrongStrategyException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { resolveAdapter } from "./internal"

/** A one-time credential returned to the API caller and never readable again. */
export type SelfServeSecret = { kind: "api_channel_token"; token: string }

type SelfServeConnector = {
  connect: (input: {
    workspaceId: string
    ownerId: string
    actorUserId?: string | null
    config: Record<string, unknown>
  }) => Promise<{ connection: ConnectionModel; secret?: SelfServeSecret }>
}

const SELF_SERVE_CONNECTORS: Partial<
  Record<IntegrationType, SelfServeConnector>
> = {
  webchat: {
    connect: async (input) => {
      const data = webchatConnectConfigSchema.parse(input.config)
      const result = await integrationWebchatService.createWithWorkspace({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        createdBy: input.actorUserId ?? input.ownerId,
        workspaceName: data.name,
        data: {
          ...data,
          auth: {},
          customCss: data.customCss ?? null,
        },
      })
      return { connection: result.connection }
    },
  },
  api: {
    connect: async (input) => {
      const { callbackUrl, name } = apiConnectConfigSchema.parse(input.config)
      const result = await integrationApiService.createWithToken({
        ownerId: input.ownerId,
        actorUserId: input.actorUserId ?? input.ownerId,
        workspaceId: input.workspaceId,
        name,
        callbackUrl,
      })
      return {
        connection: result.connection,
        secret: { kind: "api_channel_token", token: result.token },
      }
    },
  },
}

export const selfServeConnectorFor = (
  provider: IntegrationType,
): SelfServeConnector | undefined => SELF_SERVE_CONNECTORS[provider]

export const connectSelfServeChannel = async (input: {
  workspaceId: string
  provider: IntegrationType
  config: Record<string, unknown>
  actorUserId?: string | null
}): Promise<{
  connection: ConnectionModel
  secret: SelfServeSecret | null
}> => {
  const adapter = resolveAdapter(input.provider)
  const connector = selfServeConnectorFor(input.provider)
  if (!connector) {
    throw connectionWrongStrategyException(input.provider)
  }

  const ownerId = await resolveOwnerId({
    kind: adapter.provider.kind,
    workspaceId: input.workspaceId,
  })
  if (!ownerId) {
    throw notFoundException("Workspace owner not found")
  }

  const { connection, secret } = await connector.connect({
    workspaceId: input.workspaceId,
    ownerId,
    actorUserId: input.actorUserId,
    config: input.config,
  })

  return { connection, secret: secret ?? null }
}
