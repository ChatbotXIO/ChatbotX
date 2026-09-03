import {
  contactInboxRepository,
  metaCapiEventRepository,
} from "@chatbotx.io/database/repositories"
import type { MetaCapiEventModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import {
  defaultMetaCapiActionSource,
  type MetaCapiActionSource,
} from "@chatbotx.io/utils/meta-capi"
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
  capiEventDedupsPerUtcDay,
  capiEventRequiresCtwaClid,
} from "./channel-policy"
import { createDatasetWithFallback } from "./dataset-fallback"
import {
  type CapiConnectChannel,
  type ClearCapiAccessTokenInput,
  type EnqueueEventInput,
  type EnqueueTestEventInput,
  type EnsureDatasetIdInput,
  enqueueEventInput,
  type FindWorkspaceEventInput,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  type ProvisionDatasetNowInput,
  type RefreshCapiScopeCacheInput,
  type SaveCapiAccessTokenInput,
  type SaveCapiTestEventCodeInput,
  type SaveDatasetIdInput,
  saveCapiAccessTokenInput,
  saveCapiTestEventCodeInput,
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

/** A "Send test event" precondition the CAPI settings tab must surface. */
export type CapiTestEventErrorReason =
  | "testEventCodeRequired"
  | "noContactForTest"

export class CapiTestEventError extends Error {
  readonly reason: CapiTestEventErrorReason

  constructor(reason: CapiTestEventErrorReason, options?: ErrorOptions) {
    super(reason, options)
    this.name = "CapiTestEventError"
    this.reason = reason
  }
}

/** Fixed sample event for "Send test event": what Meta's own Test Events sample uses. */
const capiTestEventSample = {
  eventName: "Purchase",
  actionSource: defaultMetaCapiActionSource,
  value: "100",
  currency: "USD",
} as const

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
   * The dedup identity for a Meta CAPI event, also sent to Meta as
   * `event_id`. Channels whose messaging identity is keyed to an ad click
   * (see `channel-policy.ts`) dedup per contact per UTC day; every other
   * combination gets a unique id per fire — a distinct conversion each time
   * (BullMQ retries of the same stored event still reuse its key, so Meta
   * collapses retries).
   *
   * `actionSource` is optional only for stored steps that predate the field;
   * they read as the default, exactly as `enqueueEvent` treats them.
   */
  buildSourceKey(input: {
    scope: "flow" | "trigger" | "test"
    scopeId: string
    contactInboxId: string
    channel: MetaConversionsChannel
    actionSource?: MetaCapiActionSource
  }): string {
    const dedupsPerDay = capiEventDedupsPerUtcDay(
      input.channel,
      input.actionSource ?? defaultMetaCapiActionSource,
    )
    const dedupSegment = dedupsPerDay ? formatUtcDay(new Date()) : createId()
    return `${input.scope}:${input.scopeId}:${input.contactInboxId}:${dedupSegment}`
  }

  async enqueueEvent(
    input: EnqueueEventInput,
  ): Promise<MetaCapiEventModel | null> {
    const parsed = enqueueEventInput.parse(input)
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
      eventName: parsed.eventName,
      actionSource: parsed.actionSource,
      contentType: parsed.contentType ?? null,
      contentIds: parsed.contentIds ?? null,
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

  /**
   * Asks Meta to provision (or hand back the already-linked) dataset for the
   * resource, via the adapter-selected create token(s). The `dataset` edge is
   * idempotent — it returns the dataset currently linked to the page/IG
   * user/WABA, creating and linking a new one only when nothing is linked.
   * Shared by `ensureDatasetId` (lazy, stored-id-first) and
   * `provisionDatasetNow` (always asks Meta), so the Meta-side mechanics never
   * drift between the two callers.
   */
  private async provisionDatasetViaMeta<
    TChannel extends MetaConversionsChannel,
  >(
    adapter: CapiSendAdapter<TChannel>,
    integration: MetaConversionsIntegrationByChannel[TChannel],
    provisionDataset: EnsureDatasetIdInput<TChannel>["provisionDataset"],
  ): Promise<string> {
    // The adapter picks the create token(s); the retry stays channel-agnostic —
    // it fires only when the adapter supplied a distinct `fallbackAccessToken`
    // (currently WhatsApp's connect-token fallback for its System User token).
    const provisionInput = await adapter.buildDatasetProvisionInput(integration)
    return createDatasetWithFallback({
      primaryToken: provisionInput.accessToken,
      fallbackToken: provisionInput.fallbackAccessToken ?? null,
      create: (accessToken) =>
        provisionDataset({ ...provisionInput, accessToken }),
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
    const datasetId = await this.provisionDatasetViaMeta(
      adapter,
      input.integration,
      input.provisionDataset,
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

  /**
   * User-initiated "Create Dataset": always re-asks Meta, unlike the lazy
   * `ensureDatasetId` send-path helper. A dataset unlinked in Meta Events
   * Manager leaves a stale id in the DB that `ensureDatasetId`'s
   * stored-id-first check would keep returning forever — the send path can
   * tolerate that (it only needs *a* dataset for the next event), but a user
   * clicking "Create Dataset" needs the DB to reflect what Meta actually has
   * linked right now, so this path never trusts the stored id and only writes
   * when Meta's answer actually changed it.
   */
  async provisionDatasetNow<TChannel extends MetaConversionsChannel>(
    input: ProvisionDatasetNowInput<TChannel>,
  ): Promise<string> {
    const adapter = sendAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    const datasetId = await this.provisionDatasetViaMeta(
      adapter,
      input.integration,
      input.provisionDataset,
    )

    if (datasetId === input.integration.datasetId) {
      return datasetId
    }

    await adapter.updateDatasetId({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      datasetId,
    })

    return datasetId
  }

  /**
   * Set or clear the Events Manager `test_event_code`. While set, the worker
   * sends it with every CAPI event of this integration, so Meta shows the
   * full payload under Test Events instead of counting the event in
   * production reporting.
   */
  async saveCapiTestEventCode<TChannel extends MetaConversionsChannel>(
    input: SaveCapiTestEventCodeInput<TChannel>,
  ): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
    const parsed = saveCapiTestEventCodeInput.parse({
      testEventCode: input.testEventCode,
    })
    const adapter = sendAdapterFor(input.channel)
    adapter.assertSupported(input.integration)

    return await adapter.updateCapiTestEventCode({
      id: input.integration.id,
      workspaceId: input.integration.workspaceId,
      capiTestEventCode: parsed.testEventCode,
    })
  }

  /**
   * "Send test event": queues one sample Purchase through the real send
   * pipeline, attributed to the inbox's most recent contact (Meta needs a
   * real messaging identity even for test events). Refuses to run without a
   * saved test_event_code so a test can never become a production event;
   * the worker re-checks the code at send time for the same reason.
   */
  async enqueueTestEvent<TChannel extends MetaConversionsChannel>(
    input: EnqueueTestEventInput<TChannel>,
  ): Promise<MetaCapiEventModel | null> {
    if (!input.integration.capiTestEventCode) {
      throw new CapiTestEventError("testEventCodeRequired")
    }
    // Same gate the worker applies to real sends: pick a contact the channel
    // can actually send for instead of queuing an event Meta would reject.
    // Derived from the sample's action source, so this lookup and the
    // `buildSourceKey` call below always agree on the identity rules.
    const contactInbox = await contactInboxRepository.findMostRecentByInbox({
      inboxId: input.integration.inboxId,
      workspaceId: input.integration.workspaceId,
      requireCtwaClid: capiEventRequiresCtwaClid(
        input.channel,
        capiTestEventSample.actionSource,
      ),
    })
    if (!contactInbox) {
      throw new CapiTestEventError("noContactForTest")
    }

    return this.enqueueEvent({
      workspaceId: input.integration.workspaceId,
      channel: input.channel,
      contactInboxId: contactInbox.id,
      inboxId: input.integration.inboxId,
      source: "manualTest",
      // A fresh scopeId per click so a WhatsApp per-day dedup never swallows
      // a second test on the same day.
      sourceKey: this.buildSourceKey({
        scope: "test",
        scopeId: createId(),
        contactInboxId: contactInbox.id,
        channel: input.channel,
        actionSource: capiTestEventSample.actionSource,
      }),
      ...capiTestEventSample,
    })
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
