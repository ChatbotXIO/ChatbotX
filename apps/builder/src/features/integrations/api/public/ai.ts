import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import {
  integrationClaudeService,
  integrationDeepSeekService,
  integrationGeminiService,
  integrationOpenAIService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { connectionService } from "@chatbotx.io/connections"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  type AiProviderPathParam,
  connectAiProviderRequest,
  getAiProviderRequest,
  publicAiProviderResource,
} from "../../schema/ai-provider"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("connections")

type AiProviderRow = {
  id: string
  model: string
  temperature: number | null
  maxOutputTokens: number
  autoReply: boolean
  auth: unknown
}

const toResource = (row: AiProviderRow) => ({
  id: row.id,
  model: row.model,
  temperature: row.temperature,
  maxOutputTokens: row.maxOutputTokens,
  autoReply: row.autoReply,
  hasApiKey: Boolean(row.auth),
})

const aiProviderServices = {
  claude: integrationClaudeService,
  deepseek: integrationDeepSeekService,
  gemini: integrationGeminiService,
  openai: integrationOpenAIService,
} satisfies Record<
  AiProviderPathParam,
  {
    findByWorkspaceId: (
      workspaceId: string,
    ) => Promise<AiProviderRow | undefined>
  }
>

export const integrationsAiPublicRouter = {
  getAiProvider: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations/ai/{provider}",
      summary: "Get an AI provider integration",
      tags: ["Integrations"],
    })
    .input(getAiProviderRequest)
    .output(publicAiProviderResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const service = aiProviderServices[input.provider]
      const row = await service.findByWorkspaceId(context.workspace.id)
      if (!row) {
        throw notFoundException(`${input.provider} integration not found`)
      }
      return toResource(row)
    }),

  connectAiProvider: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/integrations/ai/{provider}",
      summary: "Connect or update an AI provider integration",
      description:
        "Deprecated — use `POST /v1/connections` instead. Upserts the AI provider integration for the workspace — connects it if not already configured, otherwise replaces the stored configuration (including the API key).",
      deprecated: true,
      tags: ["Integrations"],
    })
    .input(getAiProviderRequest.extend(connectAiProviderRequest.shape))
    .output(publicAiProviderResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const service = aiProviderServices[input.provider]

      // `allowUpdate: true` — this route has always upserted (replacing an
      // already-connected provider's stored API key/config on repeat
      // calls), unlike the strict "reject if already connected" semantics
      // `connectFromCredentials` otherwise enforces for a fresh connect.
      await connectionService.connectFromCredentials({
        workspaceId: context.workspace.id,
        provider: input.provider,
        config: {
          apiKey: input.apiKey,
          model: input.model,
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
        },
        allowUpdate: true,
      })

      await aiIntegrationService.invalidateCache(
        context.workspace.id,
        aiProviders.enum[input.provider],
      )

      const row = await service.findByWorkspaceId(context.workspace.id)
      if (!row) {
        throw notFoundException(`${input.provider} integration not found`)
      }
      return toResource(row)
    }),

  disconnectAiProvider: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/integrations/ai/{provider}",
      summary: "Disconnect an AI provider integration",
      description:
        "Deprecated — use `DELETE /v1/connections/{id}` instead. Kept for backward compatibility.",
      deprecated: true,
      tags: ["Integrations"],
      successStatus: 204,
    })
    .input(getAiProviderRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const connection = await connectionRepository.findByProviderSourceId({
        workspaceId: context.workspace.id,
        provider: input.provider,
        sourceId: "workspace",
      })
      // Idempotent, same as the pre-Connection-domain per-provider
      // `disconnect(workspaceId)` this aliases: a no-op when already
      // disconnected, not a 404.
      if (connection) {
        await connectionService.disconnect({
          connectionId: connection.id,
          workspaceId: context.workspace.id,
        })
      }

      await aiIntegrationService.invalidateCache(
        context.workspace.id,
        aiProviders.enum[input.provider],
      )
    }),
}
