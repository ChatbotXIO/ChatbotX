import {
  assertPublicUrl,
  integrationApiService,
  integrationWebchatService,
  webchatConnectConfigSchema,
} from "@chatbotx.io/business"
import { resolveOwnerId } from "@chatbotx.io/business/connection"
import { connectionWrongStrategyException } from "@chatbotx.io/business/errors"
import {
  generateApiChannelToken,
  generateSigningSecret,
} from "@chatbotx.io/business/workspace-api-token/credentials"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { z } from "zod"
import { resolveAdapter } from "./internal"

/** A one-time credential returned to the API caller and never readable again. */
export type SelfServeSecret = { kind: "api_channel_token"; token: string }

type SelfServeConnector = {
  /**
   * Many rows of this provider may coexist in one workspace. This is distinct
   * from SDK `multiAccount`, which requires a candidate-listing handler.
   */
  multiInstance: boolean
  connect: (input: {
    workspaceId: string
    ownerId: string
    actorUserId?: string | null
    config: Record<string, unknown>
  }) => Promise<{ sourceId: string; secret?: SelfServeSecret }>
}

const apiConnectConfigSchema = z.object({
  name: z.string().min(1).max(40),
  callbackUrl: z.url().nullish(),
})

export const SELF_SERVE_CONNECTORS: Partial<
  Record<IntegrationType, SelfServeConnector>
> = {
  webchat: {
    multiInstance: true,
    connect: async (input) => {
      const data = webchatConnectConfigSchema.parse(input.config)
      const result = await integrationWebchatService.createWithWorkspace({
        workspaceId: input.workspaceId,
        createdBy: input.actorUserId ?? input.ownerId,
        workspaceName: data.name,
        data: {
          ...data,
          auth: {},
          customCss: data.customCss ?? null,
        },
      })
      return { sourceId: result.webchatId }
    },
  },
  api: {
    multiInstance: true,
    connect: async (input) => {
      const { callbackUrl, name } = apiConnectConfigSchema.parse(input.config)
      if (callbackUrl) {
        await assertPublicUrl(callbackUrl, "API channel callback URL")
      }

      const { token, tokenHash, tokenPrefix } = await generateApiChannelToken()
      const signingSecret = generateSigningSecret()
      const result = await integrationApiService.connect({
        ownerId: input.ownerId,
        actorUserId: input.actorUserId ?? input.ownerId,
        workspaceId: input.workspaceId,
        name,
        auth: {
          authType: "custom",
          callbackUrl: callbackUrl ?? null,
          signingSecret,
        },
        tokenHash,
        tokenPrefix,
        callbackUrl: callbackUrl ?? null,
      })
      return {
        sourceId: result.inbox.id,
        secret: { kind: "api_channel_token", token },
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
    throw new Error("Channel connection requires a workspace owner")
  }

  const { sourceId, secret } = await connector.connect({
    workspaceId: input.workspaceId,
    ownerId,
    actorUserId: input.actorUserId,
    config: input.config,
  })
  const connection = await connectionRepository.findByProviderSourceId({
    workspaceId: input.workspaceId,
    provider: input.provider,
    sourceId,
  })
  if (!connection) {
    throw new Error(
      `connectSelfServeChannel: Connection row missing for ${input.provider} ${sourceId}`,
    )
  }

  return { connection, secret: secret ?? null }
}
