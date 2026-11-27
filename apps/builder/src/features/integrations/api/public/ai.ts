import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import {
  connectionStateService,
  integrationClaudeService,
  integrationDeepSeekService,
  integrationGeminiService,
  integrationMuseService,
  integrationOpenAIService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { connectionService } from "@chatbotx.io/connections"
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
  updateAiProviderRequest,
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
  muse: integrationMuseService,
  openai: integrationOpenAIService,
} satisfies Record<
  AiProviderPathParam,
  {
    findByWorkspaceId: (
      workspaceId: string,
    ) => Promise<AiProviderRow | undefined>
    disconnect: (workspaceId: string) => Promise<void>
  }
>

// The services' `update` signatures differ (OpenAI also needs the row `id`),
// so each provider gets a tiny adapter. `satisfies Record<AiProviderPathParam>`
// makes adding a provider to the path enum without an updater a compile error.
const aiProviderAutoReplyUpdaters = {
  claude: ({ workspaceId, autoReply }) =>
    integrationClaudeService.update({ workspaceId }, { autoReply }),
  deepseek: ({ workspaceId, autoReply }) =>
    integrationDeepSeekService.update({ workspaceId }, { autoReply }),
  gemini: ({ workspaceId, autoReply }) =>
    integrationGeminiService.update({ workspaceId }, { autoReply }),
  muse: ({ workspaceId, autoReply }) =>
    integrationMuseService.update({ workspaceId }, { autoReply }),
  openai: ({ workspaceId, id, autoReply }) =>
    integrationOpenAIService.update({ workspaceId, id }, { autoReply }),
} satisfies Record<
  AiProviderPathParam,
  (props: {
    workspaceId: string
    id: string
    autoReply: boolean
  }) => Promise<unknown>
>

export const integrationsAiPublicRouter = {
  getAiProvider: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations/ai/{provider}",
      summary: "Get AI provider integration",
      description:
        "Returns one AI provider's connected model and settings, without exposing the stored API key. Use `integrations.connectAiProvider` to configure it.",
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
      summary: "Connect or update AI provider integration",
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

  updateAiProvider: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/integrations/ai/{provider}",
      summary: "Update AI provider settings",
      description:
        "Turns the AI Reply switch (`autoReply`) on or off for one connected AI provider. Turning it on makes the provider start answering real inbound messages. Only this switch changes — model and API key are untouched. Connect the provider first with `connections.create` (or `integrations.connectAiProvider`); read the current value with `integrations.getAiProvider`. Supports claude, deepseek, gemini, muse and openai; OpenRouter and OpenAI-compatible integrations are not supported by this operation yet.",
      tags: ["Integrations"],
    })
    .input(updateAiProviderRequest)
    .output(publicAiProviderResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const service = aiProviderServices[input.provider]
      const existing = await service.findByWorkspaceId(workspaceId)
      if (!existing) {
        throw notFoundException(`${input.provider} integration not found`)
      }

      // PATCH merges a partial change: an omitted `autoReply` is left as is.
      if (input.autoReply !== undefined) {
        await aiProviderAutoReplyUpdaters[input.provider]({
          workspaceId,
          id: existing.id,
          autoReply: input.autoReply,
        })

        // Required: the worker reads AI integrations through a cache, so
        // without this the new value only applies once the TTL expires.
        await aiIntegrationService.invalidateCache(
          workspaceId,
          aiProviders.enum[input.provider],
        )
      }

      const row = await service.findByWorkspaceId(workspaceId)
      if (!row) {
        throw notFoundException(`${input.provider} integration not found`)
      }
      return toResource(row)
    }),

  disconnectAiProvider: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/integrations/ai/{provider}",
      summary: "Disconnect AI provider integration",
      description:
        "Deprecated — use `DELETE /v1/connections/{id}` instead. Kept for backward compatibility.",
      deprecated: true,
      tags: ["Integrations"],
      successStatus: 204,
    })
    .input(getAiProviderRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const service = aiProviderServices[input.provider]
      const connection = await connectionStateService.findByProviderSourceId({
        workspaceId: context.workspace.id,
        provider: input.provider,
        sourceId: "workspace",
      })
      // Idempotent, same as the pre-Connection-domain per-provider
      // `disconnect(workspaceId)` this aliases: a no-op when already
      // disconnected, not a 404. A workspace not yet backfilled into
      // `Connection` falls back to that legacy per-provider disconnect
      // directly — otherwise a stored API key would survive a
      // "disconnect" that silently no-ops here.
      if (connection) {
        await connectionService.disconnect({
          connectionId: connection.id,
          workspaceId: context.workspace.id,
        })
      } else {
        await service.disconnect(context.workspace.id)
      }

      await aiIntegrationService.invalidateCache(
        context.workspace.id,
        aiProviders.enum[input.provider],
      )
    }),
}
