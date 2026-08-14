import type { EncryptedData } from "@chatbotx.io/encryption"
import { and, type DatabaseClient, db, eq, isNull, sql } from "../../client"
import { integrationMessengerModel } from "../../schema"
import type { IntegrationMessengerModel } from "../../types"

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type UpdateMessengerCapiScopeCacheInput = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimMessengerCapiScopeCacheRefreshInput = WorkspaceIntegrationRef & {
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
    eq(integrationMessengerModel.id, input.id),
    eq(integrationMessengerModel.workspaceId, input.workspaceId),
  )

const capiScopeCasFilter = (
  input: WorkspaceIntegrationRef & { expectedCapiScopeCheckedAt: Date | null },
) =>
  and(
    workspaceIntegrationFilter(input),
    sql`${integrationMessengerModel.capiScopeCheckedAt} IS NOT DISTINCT FROM ${input.expectedCapiScopeCheckedAt}`,
  )

export const integrationMessengerRepository = {
  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .select()
      .from(integrationMessengerModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  },

  async updateCapiScopeCache(
    input: UpdateMessengerCapiScopeCacheInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? this.findWorkspaceIntegration(input, tx)
  },

  async claimCapiScopeCacheRefresh(
    input: ClaimMessengerCapiScopeCacheRefreshInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
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
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ datasetId: input.datasetId })
      .where(
        and(
          workspaceIntegrationFilter(input),
          isNull(integrationMessengerModel.datasetId),
        ),
      )
      .returning()

    return row ?? null
  },

  async updateDatasetId(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ datasetId: input.datasetId })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async updateCapiAccessToken(
    input: UpdateCapiAccessTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
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
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
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
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
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
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiDisconnectedAt: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiAccessToken: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },
}
