import {
  integrationClaudeService,
  integrationDeepSeekService,
  integrationGeminiService,
  integrationOpenAIService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
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

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

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
    connect: (input: {
      workspaceId: string
      apiKey: string
      model: string
      temperature: number
      maxOutputTokens: number
    }) => Promise<unknown>
    disconnect: (workspaceId: string) => Promise<void>
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
        "Upserts the AI provider integration for the workspace — connects it if not already configured, otherwise replaces the stored configuration (including the API key).",
      tags: ["Integrations"],
    })
    .input(getAiProviderRequest.extend(connectAiProviderRequest.shape))
    .output(publicAiProviderResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const service = aiProviderServices[input.provider]
      await service.connect({
        workspaceId: context.workspace.id,
        apiKey: input.apiKey,
        model: input.model,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
      })
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
      tags: ["Integrations"],
    })
    .input(getAiProviderRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const service = aiProviderServices[input.provider]
      await service.disconnect(context.workspace.id)
    }),
}
