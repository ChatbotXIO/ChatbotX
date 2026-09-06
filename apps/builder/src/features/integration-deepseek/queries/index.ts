import { integrationDeepSeekService } from "@chatbotx.io/business"
import type { IntegrationDeepseekResource } from "../schema/resource"

export const findIntegrationDeepSeek = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationDeepseekResource | null> =>
  (await integrationDeepSeekService.findByWorkspaceId(workspaceId)) ?? null
