import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { EncryptedData } from "@chatbotx.io/encryption"
import type {
  CapiScopeCheckInput,
  DatasetProvisionInput,
  MetaConversionsChannel,
  MetaConversionsIntegrationByChannel,
} from "../schema"

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type CapiScopeCacheUpdate = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type CapiScopeCacheSet = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
}

type CapiScopeCacheClaim = WorkspaceIntegrationRef & {
  capiScopeCheckedAt: Date
  expectedCapiScopeCheckedAt: Date | null
}

type DatasetIdUpdate = WorkspaceIntegrationRef & {
  datasetId: string
}

type CapiCustomConnect = WorkspaceIntegrationRef & {
  datasetId: string
  capiAccessToken: EncryptedData
}

type CapiDisconnect = WorkspaceIntegrationRef & {
  capiDisconnectedAt: Date
}

type CapiAccessTokenUpdate = WorkspaceIntegrationRef & {
  capiAccessToken: EncryptedData
}

export interface CapiReadinessAdapter<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> {
  assertSupported(
    integration: MetaConversionsIntegrationByChannel[TChannel],
  ): void
  buildDatasetProvisionInput(
    integration: MetaConversionsIntegrationByChannel[TChannel],
  ): Promise<DatasetProvisionInput>
  buildScopeCheckInput(
    integration: MetaConversionsIntegrationByChannel[TChannel],
  ): CapiScopeCheckInput
  claimCapiScopeCacheRefresh(
    input: CapiScopeCacheClaim,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  clearCapiDisconnectedAt(
    input: WorkspaceIntegrationRef,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  connectCustomCapi(
    input: CapiCustomConnect,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  setCapiDisconnectedAt(
    input: CapiDisconnect,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  setCapiScopeCache(
    input: CapiScopeCacheSet,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateCapiAccessToken(
    input: CapiAccessTokenUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateCapiScopeCache(
    input: CapiScopeCacheUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateDatasetId(
    input: DatasetIdUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateDatasetIdIfNull(
    input: DatasetIdUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
}
