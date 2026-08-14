import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { EncryptedData } from "@chatbotx.io/encryption"
import type {
  CapiConnectChannel,
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

/**
 * Send-path contract: implemented by ALL channels (messenger, instagram,
 * whatsapp). Used by the worker send handler and by the lazy scope-refresh /
 * dataset-provisioning paths — nothing here writes state that only the
 * connect UI should own, so it is safe for a channel with no connect flow
 * (WhatsApp) to implement.
 */
export interface CapiSendAdapter<
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
  findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  /** Compare-and-swap write, safe to call from the concurrent send path. */
  updateCapiScopeCache(
    input: CapiScopeCacheUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  /**
   * Unconditional write — every channel supports overwriting a
   * user-entered dataset id (distinct from the lazy `updateDatasetIdIfNull`
   * used by the send-path auto-provision).
   */
  updateDatasetId(
    input: DatasetIdUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateDatasetIdIfNull(
    input: DatasetIdUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
}

/**
 * Connect-path contract: implemented by every `CapiConnectChannel` (messenger,
 * instagram, whatsapp). Everything the CAPI settings tab drives — Custom
 * connection (manual dataset + encrypted token) and a user-intent disconnect.
 * A channel outside `CapiConnectChannel` cannot be passed to methods typed
 * against it (a compile error, not a runtime throw).
 */
export interface CapiConnectAdapter<
  TChannel extends CapiConnectChannel = CapiConnectChannel,
> {
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
  setCapiDisconnectedAt(
    input: CapiDisconnect,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
  updateCapiAccessToken(
    input: CapiAccessTokenUpdate,
    tx?: DatabaseClient,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null>
}

/**
 * messenger/instagram implement the full intersection (send + connect).
 * WhatsApp implements `CapiSendAdapter` only — see `adapters/whatsapp.ts`.
 */
export type CapiReadinessAdapter<
  TChannel extends CapiConnectChannel = CapiConnectChannel,
> = CapiSendAdapter<TChannel> & CapiConnectAdapter<TChannel>
