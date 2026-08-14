import type { EncryptedData } from "@chatbotx.io/encryption"
import { and, type DatabaseClient, db, eq, isNull, sql } from "../../client"
import { integrationInstagramModel } from "../../schema"
import type { IntegrationInstagramModel } from "../../types"

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type UpdateInstagramCapiScopeCacheInput = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimInstagramCapiScopeCacheRefreshInput = WorkspaceIntegrationRef & {
  capiScopeCheckedAt: Date
  expectedCapiScopeCheckedAt: Date | null
}

type UpdateDatasetIdIfNullInput = WorkspaceIntegrationRef & {
  datasetId: string
}

type UpdateCapiAccessTokenInput = WorkspaceIntegrationRef & {
  capiAccessToken: EncryptedData
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationInstagramModel.id, input.id),
    eq(integrationInstagramModel.workspaceId, input.workspaceId),
  )

const capiScopeCasFilter = (
  input: WorkspaceIntegrationRef & { expectedCapiScopeCheckedAt: Date | null },
) =>
  and(
    workspaceIntegrationFilter(input),
    sql`${integrationInstagramModel.capiScopeCheckedAt} IS NOT DISTINCT FROM ${input.expectedCapiScopeCheckedAt}`,
  )

export const integrationInstagramRepository = {
  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .select()
      .from(integrationInstagramModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  },

  async updateCapiScopeCache(
    input: UpdateInstagramCapiScopeCacheInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? this.findWorkspaceIntegration(input, tx)
  },

  async claimCapiScopeCacheRefresh(
    input: ClaimInstagramCapiScopeCacheRefreshInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? null
  },

  async updateDatasetIdIfNull(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ datasetId: input.datasetId })
      .where(
        and(
          workspaceIntegrationFilter(input),
          isNull(integrationInstagramModel.datasetId),
        ),
      )
      .returning()

    return row ?? null
  },

  async updateDatasetId(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ datasetId: input.datasetId })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async updateCapiAccessToken(
    input: UpdateCapiAccessTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiAccessToken: input.capiAccessToken })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async connectCustomCapi(
    input: WorkspaceIntegrationRef & {
      datasetId: string
      capiAccessToken: EncryptedData
    },
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        datasetId: input.datasetId,
        capiAccessToken: input.capiAccessToken,
        capiDisconnectedAt: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async setCapiDisconnectedAt(
    input: WorkspaceIntegrationRef & { capiDisconnectedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        capiDisconnectedAt: input.capiDisconnectedAt,
        capiAccessToken: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiDisconnectedAt(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiDisconnectedAt: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiAccessToken: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },
}
