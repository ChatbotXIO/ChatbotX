import type { DatabaseClient } from "../../client"

/**
 * The AI record kinds whose owning workspace can be resolved from a bare id.
 *
 * Adding a kind here is a compile-time obligation: `workspaceIdReaders` is typed
 * `Record<AiWorkspaceScope, …>`, so the build fails until the reader exists.
 */
export const AI_WORKSPACE_SCOPES = [
  "aiEmbedding",
  "aiFile",
  "conversationEmbedding",
  "conversationSource",
] as const

export type AiWorkspaceScope = (typeof AI_WORKSPACE_SCOPES)[number]

type WorkspaceIdRow = { workspaceId: string }

type WorkspaceIdReader = (
  client: DatabaseClient,
  id: string,
) => Promise<undefined | WorkspaceIdRow>

/**
 * One reader per scope. The query shape is identical everywhere — a primary-key
 * read projecting only `workspaceId` — so only the model varies. Keeping them in
 * a table instead of one method each is what stops this from becoming four
 * copies of the same body.
 */
const workspaceIdReaders: Record<AiWorkspaceScope, WorkspaceIdReader> = {
  aiEmbedding: (client, id) =>
    client.query.aiEmbeddingModel.findFirst({
      columns: { workspaceId: true },
      where: { id },
    }),
  aiFile: (client, id) =>
    client.query.aiFileModel.findFirst({
      columns: { workspaceId: true },
      where: { id },
    }),
  conversationEmbedding: (client, id) =>
    client.query.aiConversationEmbeddingModel.findFirst({
      columns: { workspaceId: true },
      where: { id },
    }),
  conversationSource: (client, id) =>
    client.query.aiConversationSourceModel.findFirst({
      columns: { workspaceId: true },
      where: { id },
    }),
}

/**
 * Resolves the owning workspace for AI knowledge-base records.
 *
 * AI job payloads carry only a record id (`aiFileId`, `sourceId`, …), so the
 * worker cannot decide whether a job belongs to a frozen workspace without one
 * of these lookups. Each is a single indexed primary-key read returning just the
 * `workspaceId` column — cheap next to the embedding API call it gates.
 */
export class AiWorkspaceScopeRepository {
  private readonly client: DatabaseClient

  constructor(client: DatabaseClient) {
    this.client = client
  }

  async findWorkspaceId(params: {
    id: string
    scope: AiWorkspaceScope
  }): Promise<string | undefined> {
    const row = await workspaceIdReaders[params.scope](this.client, params.id)
    return row?.workspaceId
  }
}
