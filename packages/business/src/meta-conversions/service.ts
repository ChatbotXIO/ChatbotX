import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import type { MetaCapiEventModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { instagramIntegrationService } from "../integration-instagram/service"
import { messengerIntegrationService } from "../integration-messenger/service"
import { integrationWhatsappService } from "../integration-whatsapp/service"
import { formatUtcDay } from "../lib/date"
import { logger } from "../logger"
import { instagramCapiReadinessAdapter } from "./adapters/instagram"
import { messengerCapiReadinessAdapter } from "./adapters/messenger"
import type { CapiReadinessAdapter, CapiSendAdapter } from "./adapters/types"
import { whatsappCapiReadinessAdapter } from "./adapters/whatsapp"
import {
  type CapiConnectChannel,
  type ClearCapiAccessTokenInput,
  type EnqueueLeadEventInput,
  type EnsureDatasetIdInput,
  enqueueLeadEventInput,
  type FindWorkspaceEventInput,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  metaCapiEventName,
  type ProvisionDatasetNowInput,
  type RefreshCapiScopeCacheInput,
  type SaveCapiAccessTokenInput,
  type SaveDatasetIdInput,
  saveCapiAccessTokenInput,
  saveDatasetIdInput,
  type UpdateCapiStatusInput,
  updateCapiStatusInput,
} from "./schema"
import { resolveCapiAccessToken } from "./token"

const META_CAPI_SCOPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export class CapiScopeRefreshError extends Error {
  retryable = true

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "CapiScopeRefreshError"
  }
}

// Send-path adapters: all 3 channels. Used by every method that runs on the
// worker send path or the lazy scope-refresh/dataset-provisioning paths.
const capiSendAdapters = {
  messenger: messengerCapiReadinessAdapter,
  instagram: instagramCapiReadinessAdapter,
  whatsapp: whatsappCapiReadinessAdapter,
} satisfies {
  [TChannel in MetaConversionsChannel]: CapiSendAdapter<TChannel>
}

function sendAdapterFor<TChannel extends MetaConversionsChannel>(
  channel: TChannel,
): CapiSendAdapter<TChannel> {
  return capiSendAdapters[channel] as CapiSendAdapter<TChannel>
}

// Connect-path adapters: messenger/instagram/whatsapp — see CapiConnectAdapter.
const capiConnectAdapters = {
  messenger: messengerCapiReadinessAdapter,
  instagram: instagramCapiReadinessAdapter,
  whatsapp: whatsappCapiReadinessAdapter,
} satisfies {
  [TChannel in CapiConnectChannel]: CapiReadinessAdapter<TChannel>
}

function connectAdapterFor<TChannel extends CapiConnectChannel>(
  channel: TChannel,
): CapiReadinessAdapter<TChannel> {
  return capiConnectAdapters[channel] as CapiReadinessAdapter<TChannel>
}

const integrationResolvers = {
  messenger: (input) =>
    messengerIntegrationService.findByInboxIdForWorkspace(input),
  instagram: (input) =>
    instagramIntegrationService.findByInboxIdForWorkspace(input),
  whatsapp: (input) =>
    integrationWhatsappService.findByInboxIdForWorkspace(input),
} satisfies {
  [TChannel in MetaConversionsChannel]: (input: {
    inboxId: string
    workspaceId: string
  }) => Promise<MetaConversionsIntegrationByChannel[TChannel]>
}

function resolveIntegrationForChannel<TChannel extends MetaConversionsChannel>(
  channel: TChannel,
  input: { inboxId: string; workspaceId: string },
): Promise<MetaConversionsIntegrationByChannel[TChannel]> {
  return integrationResolvers[channel](input) as Promise<
    MetaConversionsIntegrationByChannel[TChannel]
  >
}

async function enqueueSendMetaCapiEvent(
  event: Pick<MetaCapiEventModel, "id" | "workspaceId">,
): Promise<void> {
  await enqueueIntegrationJob(
    {
      type: IntegrationJobAction.sendMetaCapiEvent,
      data: {
        metaCapiEventId: event.id,
        workspaceId: event.workspaceId,
      },
    },
    {
      jobId: `meta-capi-send-${event.id}`,
    },
  )
}

class MetaConversionsService extends BaseService {
  formatUtcDay(date: Date): string {
    return formatUtcDay(date)
  }

  /**
   * The dedup identity for a lead event, also sent to Meta as `event_id`.
   *
   * WhatsApp is capped by Meta at one CAPI event per click-to-WhatsApp ad, so
   * it dedups per contact per UTC day. Messenger/Instagram have no such cap —
   * every fire is a distinct conversion, so a unique id is used (BullMQ retries
   * of the same stored event still reuse its key, so Meta collapses retries).
   */
  buildLeadSourceKey(input: {
    scope: "flow" | "trigger"
    scopeId: string
    contactInboxId: string
    channel: MetaConversionsChannel
  }): string {
    const dedupSegment =
      input.channel === "whatsapp" ? formatUtcDay(new Date()) : createId()
    return `${input.scope}:${input.scopeId}:${input.contactInboxId}:${dedupSegment}`
  }

  async enqueueLeadEvent(
    input: EnqueueLeadEventInput,
  ): Promise<MetaCapiEventModel | null> {
    const parsed = enqueueLeadEventInput.parse(input)
    const occurredAt = parsed.occurredAt ?? new Date()
    const integration = await resolveIntegrationForChannel(parsed.channel, {
      inboxId: parsed.inboxId,
      workspaceId: parsed.workspaceId,
    })
    sendAdapterFor(parsed.channel).assertSupported(integration)

    const inserted = await metaCapiEventRepository.insertIgnoreDuplicate({
      workspaceId: parsed.workspaceId,
      channel: parsed.channel,
      integrationId: integration.id,
      contactInboxId: parsed.contactInboxId,
      eventName: metaCapiEventName,
      currency: parsed.currency ?? null,
      contentCategory: parsed.contentCategory ?? null,
      contentName: parsed.contentName ?? null,
      value: parsed.value ?? null,
      source: parsed.source,
      sourceKey: parsed.sourceKey,
      occurredAt,
      capiStatus: "pending",
      capiSentAt: null,
      capiError: null,
    })

    if (inserted) {
      await enqueueSendMetaCapiEvent(inserted)
      return inserted
    }

    const existing = await metaCapiEventRepository.findPendingBySourceKey({
      workspaceId: parsed.workspaceId,
      channel: parsed.channel,
      sourceKey: parsed.sourceKey,
    })
    if (existing) {
      await enqueueSendMetaCapiEvent(existing)
    }

    return null
  }

  async refreshCapiScopeCache<TChannel extends MetaConversionsChannel>(
    input: RefreshCapiScopeCacheInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const now = input.now ?? new Date()
    const maxAgeMs = input.maxAgeMs ?? META_CAPI_SCOPE_CACHE_TTL_MS
    const adapter = sendAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    if (
      input.integration.capiScopeCheckedAt &&
      now.getTime() - input.integration.capiScopeCheckedAt.getTime() < maxAgeMs
    ) {
      return input.integration
    }

    const expectedCapiScopeCheckedAt =
      input.integration.capiScopeCheckedAt ?? null
    const ref = {
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
    }
    const claimed = await adapter.claimCapiScopeCacheRefresh({
      ...ref,
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt,
    })
    if (!claimed) {
      return adapter.findWorkspaceIntegration(ref)
    }

    let hasCapiScope: boolean
    try {
      hasCapiScope = await input.checkScope(
        adapter.buildScopeCheckInput(input.integration),
      )
    } catch (err) {
      logger.warn(
        {
          err,
          channel: input.channel,
          id: input.integration.id,
          workspaceId: input.integration.workspaceId,
        },
        "meta-conversions: CAPI scope refresh failed",
      )
      await adapter
        .updateCapiScopeCache({
          ...ref,
          hasCapiScope: input.integration.hasCapiScope,
          capiScopeCheckedAt: expectedCapiScopeCheckedAt,
          expectedCapiScopeCheckedAt: now,
        })
        .catch((restoreError) => {
          logger.warn(
            {
              err: restoreError,
              channel: input.channel,
              id: input.integration.id,
              workspaceId: input.integration.workspaceId,
            },
            "meta-conversions: failed to restore CAPI scope refresh claim",
          )
        })
      throw new CapiScopeRefreshError(
        "Meta CAPI scope refresh failed",
        err instanceof Error ? { cause: err } : undefined,
      )
    }

    return adapter.updateCapiScopeCache({
      ...ref,
      hasCapiScope,
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: now,
    })
  }

  async ensureDatasetId<TChannel extends MetaConversionsChannel>(
    input: EnsureDatasetIdInput<TChannel>,
  ): Promise<string> {
    const adapter = sendAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    if (input.integration.datasetId) {
      return input.integration.datasetId
    }

    const ref = {
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
    }
    const datasetId = await input.provisionDataset(
      await adapter.buildDatasetProvisionInput(input.integration),
    )
    const updated = await adapter.updateDatasetIdIfNull({
      ...ref,
      datasetId,
    })
    if (updated?.datasetId) {
      return updated.datasetId
    }

    const reread = await adapter.findWorkspaceIntegration(ref)
    if (reread?.datasetId) {
      return reread.datasetId
    }

    throw new Error("Meta CAPI dataset id was not stored")
  }

  async saveDatasetId<TChannel extends MetaConversionsChannel>(
    input: SaveDatasetIdInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const parsed = saveDatasetIdInput.parse({ datasetId: input.datasetId })
    const adapter = sendAdapterFor(input.channel)
    adapter.assertSupported(input.integration)
    const resolved = await resolveCapiAccessToken(input.integration)

    await input.validate({
      datasetId: parsed.datasetId,
      accessToken: resolved.accessToken,
    })

    return adapter.updateDatasetId({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      datasetId: parsed.datasetId,
    })
  }

  provisionDatasetNow<TChannel extends MetaConversionsChannel>(
    input: ProvisionDatasetNowInput<TChannel>,
  ): Promise<string> {
    return this.ensureDatasetId(input)
  }

  async saveCapiAccessToken<TChannel extends CapiConnectChannel>(
    input: SaveCapiAccessTokenInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const parsed = saveCapiAccessTokenInput.parse({
      accessToken: input.accessToken,
      datasetId: input.datasetId,
    })
    const adapter = connectAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    await input.validate({
      datasetId: parsed.datasetId,
      accessToken: parsed.accessToken,
    })

    const capiAccessToken = await encryptUtils.encryptObject({
      accessToken: parsed.accessToken,
    })

    return adapter.updateCapiAccessToken({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      capiAccessToken,
    })
  }

  clearCapiAccessToken<TChannel extends CapiConnectChannel>(
    input: ClearCapiAccessTokenInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const adapter = connectAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    return adapter.clearCapiAccessToken({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
    })
  }

  /**
   * Custom connection: validates the pasted dataset id + token pair, then
   * writes dataset id, encrypted token, and the cleared disconnect flag in a
   * single atomic update — no half-connected state is ever visible.
   */
  async connectCustomCapi<TChannel extends CapiConnectChannel>(
    input: SaveCapiAccessTokenInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const parsed = saveCapiAccessTokenInput.parse({
      accessToken: input.accessToken,
      datasetId: input.datasetId,
    })
    const adapter = connectAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    await input.validate({
      datasetId: parsed.datasetId,
      accessToken: parsed.accessToken,
    })

    const capiAccessToken = await encryptUtils.encryptObject({
      accessToken: parsed.accessToken,
    })

    return adapter.connectCustomCapi({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      datasetId: parsed.datasetId,
      capiAccessToken,
    })
  }

  /**
   * User-intent disconnect: sets the disconnect flag and clears the manual
   * token in one write. The dataset id is kept — it still belongs to the
   * page/account and reconnecting reuses it.
   */
  disconnectCapi<TChannel extends CapiConnectChannel>(
    input: ClearCapiAccessTokenInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const adapter = connectAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    return adapter.setCapiDisconnectedAt({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      capiDisconnectedAt: new Date(),
    })
  }

  /**
   * Re-enables CAPI after a user disconnect (called by the OAuth connect
   * callback and the custom connect path).
   */
  reconnectCapi<TChannel extends CapiConnectChannel>(
    input: ClearCapiAccessTokenInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const adapter = connectAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    return adapter.clearCapiDisconnectedAt({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
    })
  }

  findWorkspaceEvent(input: FindWorkspaceEventInput) {
    return metaCapiEventRepository.findWorkspaceEvent(input)
  }

  updateCapiStatus(input: UpdateCapiStatusInput) {
    const parsed = updateCapiStatusInput.parse(input)

    return metaCapiEventRepository.updateCapiStatus(parsed)
  }
}

export const metaConversionsService = new MetaConversionsService()
