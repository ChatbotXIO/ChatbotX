import type { OpenaiCompatibleProviderPreset } from "@chatbotx.io/ai"
import type { IntegrationOpenaiCompatibleModel } from "@chatbotx.io/database/types"

export type IntegrationOpenaiCompatibleResource = Pick<
  IntegrationOpenaiCompatibleModel,
  | "id"
  | "workspaceId"
  | "name"
  | "baseURL"
  | "defaultModel"
  | "enabled"
  | "autoReply"
  | "createdAt"
  | "updatedAt"
> & {
  preset: OpenaiCompatibleProviderPreset
}

export function mapIntegrationOpenaiCompatibleResource(
  integration: IntegrationOpenaiCompatibleModel,
): IntegrationOpenaiCompatibleResource {
  return {
    id: integration.id,
    workspaceId: integration.workspaceId,
    name: integration.name,
    preset: integration.preset as OpenaiCompatibleProviderPreset,
    baseURL: integration.baseURL,
    defaultModel: integration.defaultModel,
    enabled: integration.enabled,
    autoReply: integration.autoReply,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  }
}
