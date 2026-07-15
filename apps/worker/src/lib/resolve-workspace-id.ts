import { conversationService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { integrationService } from "../services/integrations"

type JobData = {
  workspaceId?: unknown
  conversation?: { workspaceId?: unknown } | null
  conversationId?: unknown
  importId?: unknown
  integrationType?: unknown
  integrationIdentifier?: unknown
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

export async function resolveWorkspaceId(
  data: unknown,
): Promise<string | undefined> {
  if (!data || typeof data !== "object") {
    return
  }

  const jobData = data as JobData
  const directWorkspaceId =
    asString(jobData.workspaceId) ?? asString(jobData.conversation?.workspaceId)
  if (directWorkspaceId) {
    return directWorkspaceId
  }

  const integrationType = asString(jobData.integrationType)
  const integrationIdentifier = asString(jobData.integrationIdentifier)
  if (integrationType && integrationIdentifier) {
    try {
      const result =
        await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
          integrationType as IntegrationType,
          integrationIdentifier,
        )
      return result.inbox.workspaceId
    } catch {
      return
    }
  }

  const conversationId = asString(jobData.conversationId)
  if (conversationId) {
    const conversation = await conversationService.findBy({
      where: { id: conversationId },
    })
    return conversation?.workspaceId
  }

  // AI embedding/file jobs intentionally remain fail-open: their payloads do
  // not carry a workspace identity and resolving through source/file records
  // would add unnecessary database work to these background jobs.
  const importId = asString(jobData.importId)
  if (importId) {
    const contactImport = await db.query.importModel.findFirst({
      where: { id: importId },
      columns: { workspaceId: true },
    })
    return contactImport?.workspaceId
  }
}
