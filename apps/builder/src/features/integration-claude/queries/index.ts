import { integrationClaudeService } from "@chatbotx.io/business"
import type { IntegrationClaudeResource } from "../schema/resource"

export const findIntegrationClaude = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationClaudeResource | null> =>
  (await integrationClaudeService.findByWorkspaceId(workspaceId)) ?? null
