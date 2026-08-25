import {
  ADS_INTEGRATION_FK_BY_CHANNEL,
  type AdReferralChannel,
  contactInboxService,
  contactService,
  integrationWhatsappService,
  isAdReferralChannel,
  type MetaConversionsIntegrationByChannel,
  metaConversionsService,
  resolveCapiAccessToken,
  whatsappAuthForCapiScopeSchema,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { adsConversionEventRepository } from "@chatbotx.io/database/repositories"
import type { AdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  buildDatasetName,
  ensureDataset as ensureMetaConversionsDataset,
  type MetaCapiEventName,
  type MetaConversionEventInput,
  sendConversionEvent as sendMetaConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
import {
  ensureDataset as ensureWhatsappConversionsDataset,
  sendConversionEvent as sendWhatsappConversionEvent,
} from "@chatbotx.io/integration-whatsapp/api/conversions"
import {
  type AdsConversionJobSendConversionEvent,
  DefaultJobAction,
  defaultQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import {
  datasetResourceType,
  findEventIntegration,
  refreshScopeCache,
} from "../meta-conversions/capi-scope-checkers"

type SendConversionEventData = AdsConversionJobSendConversionEvent["data"]

const skippedNoScopeStatus = {
  from: "pending",
  to: "skipped_no_scope",
} as const

const failedStatus = {
  from: "pending",
  to: "failed",
} as const

const sentStatus = {
  from: "pending",
  to: "sent",
} as const

// Messenger/Instagram CAPI has no automatic-events distinction (that concept
// is WhatsApp-only — see AdsConversionService.ingestAutomaticEvent), so
// every messenger/instagram AdsConversionEvent maps 1:1 to one of these two
// Meta event names.
const capiEventNameByEventType = {
  lead: "LeadSubmitted",
  purchase: "Purchase",
} as const satisfies Record<
  AdsConversionEventModel["eventType"],
  MetaCapiEventName
>

/**
 * Marks an `AdsConversionEvent` row `failed` (pending → failed) — shared by
 * every early-exit guard in `handleSendMetaChannelConversionEvent` (missing
 * integration id, integration not found, CAPI-disconnected, missing/foreign
 * contactInboxId). Each caller keeps its own distinct logger call before
 * invoking this; this helper only owns the `updateCapiStatus` write.
 */
async function markEventFailed(
  event: Pick<AdsConversionEventModel, "id" | "workspaceId">,
): Promise<void> {
  await adsConversionEventRepository.updateCapiStatus({
    id: event.id,
    workspaceId: event.workspaceId,
    ...failedStatus,
  })
}

/** Reads the FK column matching `channel` off an `AdsConversionEvent` row —
 * driven by the same `ADS_INTEGRATION_FK_BY_CHANNEL` map every other
 * channel×FK lookup in the ads-conversion pipeline uses. */
function metaChannelIntegrationId(
  event: AdsConversionEventModel,
  channel: AdReferralChannel,
): string | null {
  return event[ADS_INTEGRATION_FK_BY_CHANNEL[channel]]
}

type SharedMetaConversionEventFields = {
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  currency: string | null
  value: string | null
}

/**
 * Per-channel Meta Conversions API payload builder — mirrors
 * `channelUserDataBuilders` in `integrations/meta-conversions/src/apis/
 * events.ts`. Keeps the exact fields/`as` casts of the pre-map ternary:
 * `integrationForSend`'s channel-specific shape is only known at the call
 * site, so it stays cast per builder rather than threading a generic through
 * this map.
 */
const metaChannelEventPayloadBuilders = {
  messenger: (
    shared: SharedMetaConversionEventFields,
    integrationForSend: unknown,
    contactInbox: { sourceId: string },
  ): MetaConversionEventInput => ({
    ...shared,
    messagingChannel: "messenger",
    pageId: (
      integrationForSend as MetaConversionsIntegrationByChannel["messenger"]
    ).pageId,
    pageScopedUserId: contactInbox.sourceId,
  }),
  instagram: (
    shared: SharedMetaConversionEventFields,
    integrationForSend: unknown,
    contactInbox: { sourceId: string },
  ): MetaConversionEventInput => ({
    ...shared,
    messagingChannel: "instagram",
    instagramBusinessAccountId: (
      integrationForSend as MetaConversionsIntegrationByChannel["instagram"]
    ).igId,
    igSid: contactInbox.sourceId,
  }),
} satisfies Record<
  AdReferralChannel,
  (
    shared: SharedMetaConversionEventFields,
    integrationForSend: unknown,
    contactInbox: { sourceId: string },
  ) => MetaConversionEventInput
>

async function reportTerminalCapiFailure(input: {
  event: Pick<AdsConversionEventModel, "id" | "workspaceId">
  error: unknown
}): Promise<void> {
  const { event, error } = input

  await adsConversionEventRepository.updateCapiStatus({
    id: event.id,
    workspaceId: event.workspaceId,
    ...failedStatus,
  })
  await defaultQueue.add(DefaultJobAction.sendErrorLog, {
    type: DefaultJobAction.sendErrorLog,
    data: {
      workspaceId: event.workspaceId,
      error: {
        message:
          error instanceof Error
            ? error.message
            : "Meta Conversions API terminal failure",
        stack: error instanceof Error ? error.stack : undefined,
        httpCode: "400",
      },
    },
  })
  logger.warn(
    {
      adsConversionEventId: event.id,
      workspaceId: event.workspaceId,
      err: error,
    },
    "Ads conversion event marked failed",
  )
}

async function handleSendWhatsappConversionEvent(
  event: AdsConversionEventModel,
): Promise<void> {
  // AdsConversionEvent's WhatsApp attribution columns became nullable when
  // the schema widened to support Messenger/Instagram channels (Phase 1).
  // A whatsapp-channel row missing any of them is a bug upstream, not a
  // reachable state today (the CHECK constraint enforces this at the DB
  // level for channel="whatsapp" rows).
  if (!(event.integrationWhatsappId && event.ctwaClid && event.wabaId)) {
    logger.error(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        channel: event.channel,
      },
      "AdsConversionEvent missing WhatsApp attribution fields; marking failed",
    )
    await adsConversionEventRepository.updateCapiStatus({
      id: event.id,
      workspaceId: event.workspaceId,
      ...failedStatus,
    })
    return
  }

  const integration = await integrationWhatsappService.findWorkspaceIntegration(
    {
      id: event.integrationWhatsappId,
      workspaceId: event.workspaceId,
    },
  )
  if (!integration) {
    return
  }

  const auth = whatsappAuthForCapiScopeSchema.parse(integration.auth)
  if (!integration.hasCapiScope) {
    await adsConversionEventRepository.updateCapiStatus({
      id: event.id,
      workspaceId: event.workspaceId,
      ...skippedNoScopeStatus,
    })
    return
  }

  try {
    // Dataset provisioning shares the send's error classification: a
    // retryable Meta error rethrows for a BullMQ retry, while a terminal one
    // is caught below and marks the event `failed` instead of stranding it
    // as `pending`.
    // `ensureDatasetId` picks the create token (WhatsApp's agency System User
    // token for embedded-signup connections, with a connect-token fallback),
    // so this callback just performs the create with whatever token it is
    // handed.
    const datasetId = await integrationWhatsappService.ensureDatasetId({
      id: integration.id,
      workspaceId: integration.workspaceId,
      provision: ({ wabaId, wabaName, accessToken }) =>
        ensureWhatsappConversionsDataset({
          wabaId,
          accessToken,
          datasetName: buildDatasetName(wabaName),
          version: auth.version,
        }),
    })

    await sendWhatsappConversionEvent({
      datasetId,
      accessToken: auth.tokens.accessToken,
      version: auth.version,
      event: {
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        sourceEventId: event.sourceEventId,
        ctwaClid: event.ctwaClid,
        wabaId: event.wabaId,
        currency: event.currency,
        value: event.value,
        messagingOutcomeType:
          event.source === "automatic" ? "automatic_events" : undefined,
      },
    })
  } catch (error) {
    if (error instanceof Error && "retryable" in error && error.retryable) {
      throw error
    }

    await reportTerminalCapiFailure({ event, error })
    return
  }

  await adsConversionEventRepository.updateCapiStatus({
    id: event.id,
    workspaceId: event.workspaceId,
    ...sentStatus,
    capiSentAt: new Date(),
  })
}

/**
 * Messenger/Instagram CAPI send branch (Phase 3): uses the generic
 * `@chatbotx.io/integration-meta-conversions` client (the same one
 * `send-meta-capi-event.ts`'s LeadSubmitted pipeline uses) instead of the
 * WhatsApp-native client — identity comes from the integration row
 * (`pageId`/`igId`) plus `ContactInbox.sourceId` (PSID/IGSID). Scope-check
 * and dataset-provisioning plumbing is shared with `send-meta-capi-event.ts`
 * via `capi-scope-checkers.ts` / `metaConversionsService`.
 */
async function handleSendMetaChannelConversionEvent(
  event: AdsConversionEventModel,
  channel: AdReferralChannel,
): Promise<void> {
  const integrationId = metaChannelIntegrationId(event, channel)
  if (!integrationId) {
    logger.error(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        channel,
      },
      `AdsConversionEvent missing ${channel} integration id; marking failed`,
    )
    await markEventFailed(event)
    return
  }

  const integration = await findEventIntegration(channel, {
    integrationId,
    workspaceId: event.workspaceId,
  })
  if (!integration) {
    logger.warn(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        channel,
        integrationId,
      },
      "AdsConversionEvent integration not found; marking failed",
    )
    await markEventFailed(event)
    return
  }

  // A user-intent CAPI disconnect blocks the send, mirroring
  // `send-meta-capi-event.ts`'s `capiDisconnectedAt` guard.
  if ("capiDisconnectedAt" in integration && integration.capiDisconnectedAt) {
    await markEventFailed(event)
    return
  }

  if (!event.contactInboxId) {
    logger.error(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        channel,
      },
      "AdsConversionEvent missing contactInboxId; marking failed",
    )
    await markEventFailed(event)
    return
  }

  const contactInbox = await contactInboxService.findByUncached({
    where: { id: event.contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        contactInboxId: event.contactInboxId,
      },
      "AdsConversionEvent contact inbox not found; marking failed",
    )
    await markEventFailed(event)
    return
  }

  // Defense-in-depth identity check: `contactInbox` above is looked up by id
  // alone (no workspace/inbox scoping in the query itself), and it powers the
  // PSID/IGSID (`contactInbox.sourceId`) sent to Meta's CAPI as this
  // contact's identity. Without this check a stale/foreign `contactInboxId`
  // on the event would leak one tenant's messaging identity into another
  // tenant's ad dataset. `ContactInboxModel` has no direct `workspaceId`
  // column, so workspace membership is verified via the workspace-scoped
  // `contactService.findById` (returns undefined for a foreign workspace);
  // inbox membership is verified directly against the resolved integration's
  // `inboxId` (an integration owns exactly one inbox).
  const contactInboxContact = await contactService.findById({
    workspaceId: event.workspaceId,
    id: contactInbox.contactId,
  })
  if (!contactInboxContact || contactInbox.inboxId !== integration.inboxId) {
    logger.error(
      {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        contactInboxId: contactInbox.id,
        contactInboxInboxId: contactInbox.inboxId,
        integrationInboxId: integration.inboxId,
      },
      "AdsConversionEvent contact inbox workspace/inbox mismatch; marking failed",
    )
    await markEventFailed(event)
    return
  }

  try {
    const auth = await resolveCapiAccessToken(integration)
    const integrationForSend =
      auth.source === "manual"
        ? integration
        : await refreshScopeCache(channel, integration)

    if (auth.source === "manual" && !integrationForSend.datasetId) {
      await adsConversionEventRepository.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...skippedNoScopeStatus,
      })
      return
    }

    if (auth.source === "oauth" && !integrationForSend.hasCapiScope) {
      await adsConversionEventRepository.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...skippedNoScopeStatus,
      })
      return
    }

    const datasetId =
      auth.source === "manual" && integrationForSend.datasetId
        ? integrationForSend.datasetId
        : await metaConversionsService.ensureDatasetId({
            channel,
            integration: integrationForSend,
            provisionDataset: ({ accessToken, resourceId, resourceName }) =>
              ensureMetaConversionsDataset({
                resourceType: datasetResourceType(channel),
                resourceId,
                accessToken,
                datasetName: buildDatasetName(resourceName),
              }),
          })

    const eventName = capiEventNameByEventType[event.eventType]
    const sharedEventFields = {
      eventName,
      occurredAt: event.occurredAt,
      eventId: event.sourceEventId,
      currency: event.currency,
      value: event.value,
    }

    await sendMetaConversionEvent({
      datasetId,
      accessToken: auth.accessToken,
      event: metaChannelEventPayloadBuilders[channel](
        sharedEventFields,
        integrationForSend,
        contactInbox,
      ),
    })
  } catch (error) {
    if (error instanceof Error && "retryable" in error && error.retryable) {
      throw error
    }

    await reportTerminalCapiFailure({ event, error })
    return
  }

  await adsConversionEventRepository.updateCapiStatus({
    id: event.id,
    workspaceId: event.workspaceId,
    ...sentStatus,
    capiSentAt: new Date(),
  })
}

export async function handleSendConversionEvent(
  data: SendConversionEventData,
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const event = await adsConversionEventRepository.findWorkspaceEvent({
      id: data.adsConversionEventId,
      workspaceId: data.workspaceId,
    })
    if (event?.capiStatus !== "pending") {
      return
    }

    if (isAdReferralChannel(event.channel)) {
      await handleSendMetaChannelConversionEvent(event, event.channel)
      return
    }

    // whatsapp (the only remaining channel a real AdsConversionEvent row can
    // carry — the DB CHECK constraint rejects any other channel/integration
    // combination) — existing native WhatsApp path, unchanged.
    await handleSendWhatsappConversionEvent(event)
  })
}
