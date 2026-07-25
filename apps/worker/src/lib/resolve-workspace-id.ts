import { conversationService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { createAiWorkspaceScopeRepository } from "@chatbotx.io/database/repositories"
import { integrationService } from "../services/integrations"

const aiWorkspaceScopeRepository = createAiWorkspaceScopeRepository()

type JobData = {
  workspaceId?: unknown
  aiEmbeddingId?: unknown
  aiFileId?: unknown
  conversation?: { workspaceId?: unknown } | null
  conversationEmbeddingId?: unknown
  conversationId?: unknown
  importId?: unknown
  smartDelayId?: unknown
  sourceId?: unknown
  integrationType?: unknown
  integrationIdentifier?: unknown
}

/** Payload fields that carry a single record id resolvable to one workspace. */
type RecordIdField =
  | "aiEmbeddingId"
  | "aiFileId"
  | "conversationEmbeddingId"
  | "conversationId"
  | "importId"
  | "smartDelayId"
  | "sourceId"

type RecordIdResolver = {
  field: RecordIdField
  resolve: (id: string) => Promise<string | undefined>
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const nestedWorkspaceId = (value: unknown): string | undefined =>
  value && typeof value === "object" && "workspaceId" in value
    ? asString(value.workspaceId)
    : undefined

/**
 * Ordered lookup table: the first field present on the payload wins.
 *
 * A table rather than a chain of ifs because every entry has the same shape —
 * one id in, one workspaceId out. Supporting a new job payload means adding a
 * row, not another branch, and the ordering stays readable in one glance.
 *
 * The AI knowledge-base rows resolve rather than fail open: one indexed
 * single-column read is far cheaper than the embedding API call it gates, and
 * failing open would let a frozen workspace keep burning embedding credits.
 */
const recordIdResolvers: readonly RecordIdResolver[] = [
  {
    field: "conversationId",
    resolve: async (id) =>
      (await conversationService.findBy({ where: { id } }))?.workspaceId,
  },
  {
    field: "smartDelayId",
    resolve: async (id) =>
      (await smartDelayService.findById({ id }))?.workspaceId,
  },
  {
    field: "aiFileId",
    resolve: (id) =>
      aiWorkspaceScopeRepository.findWorkspaceId({ id, scope: "aiFile" }),
  },
  {
    field: "aiEmbeddingId",
    resolve: (id) =>
      aiWorkspaceScopeRepository.findWorkspaceId({ id, scope: "aiEmbedding" }),
  },
  {
    field: "sourceId",
    resolve: (id) =>
      aiWorkspaceScopeRepository.findWorkspaceId({
        id,
        scope: "conversationSource",
      }),
  },
  {
    field: "conversationEmbeddingId",
    resolve: (id) =>
      aiWorkspaceScopeRepository.findWorkspaceId({
        id,
        scope: "conversationEmbedding",
      }),
  },
  {
    field: "importId",
    resolve: async (id) =>
      (
        await db.query.importModel.findFirst({
          where: { id },
          columns: { workspaceId: true },
        })
      )?.workspaceId,
  },
]

/**
 * Best-effort workspace identity for an arbitrary job payload, used by the
 * freeze guards. Returning `undefined` means "cannot attribute", which callers
 * treat as fail-open.
 */
export async function resolveWorkspaceId(
  data: unknown,
): Promise<string | undefined> {
  if (!data || typeof data !== "object") {
    return
  }

  const jobData = data as JobData
  const directWorkspaceId =
    asString(jobData.workspaceId) ??
    asString(jobData.conversation?.workspaceId) ??
    nestedWorkspaceId(jobData.conversationId)
  if (directWorkspaceId) {
    return directWorkspaceId
  }

  // Two fields rather than one id, so it stays out of the table above.
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

  for (const resolver of recordIdResolvers) {
    const id = asString(jobData[resolver.field])
    if (id) {
      return await resolver.resolve(id)
    }
  }
}
