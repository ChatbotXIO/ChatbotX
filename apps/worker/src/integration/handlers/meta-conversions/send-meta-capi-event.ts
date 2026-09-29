import {
  buildChannelIdentity,
  capiDatasetResourceType,
  capiEventRequiresCtwaClid,
  contactInboxService,
  contactService,
  hashContactUserData,
  isCapiDisconnected,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  metaConversionsService,
  resolveCapiAccessTokenForChannel,
  resolveContactMessagingId,
  withBlockedOwnerGuard,
  workspaceService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import type { MetaCapiEventModel } from "@chatbotx.io/database/types"
import {
  buildDatasetName,
  ensureDataset,
  type MetaCapiEventName,
  sendConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
import {
  type HashedCapiUserData,
  type MetaCapiActionSource,
  type MetaCapiContentType,
  metaCapiActionSourcePolicy,
} from "@chatbotx.io/utils/meta-capi"
import type { IntegrationJobSendMetaCapiEvent } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { findEventIntegration, refreshScopeCache } from "./capi-scope-checkers"

type SendMetaCapiEventData = IntegrationJobSendMetaCapiEvent["data"]

const skippedNoScopeStatus = {
  from: "pending",
  to: "skipped_no_scope",
} as const

const skippedDisconnectedStatus = {
  from: "pending",
  to: "skipped_disconnected",
} as const

// WhatsApp business-messaging CAPI requires a ctwa_clid (click-to-WhatsApp ad
// identifier), which only exists for contacts that arrived via a CTWA ad —
// this is a Meta constraint, not a transient failure. Only relevant when the
// event's action source actually uses the messaging identity
// (`metaCapiActionSourcePolicy[actionSource].usesMessagingIdentity`) — a
// WhatsApp event sent with a non-messaging action source (e.g. `email`)
// identifies the person via hashed customer info instead and never needs a
// ctwa_clid.
const skippedNoIdentityStatus = {
  from: "pending",
  to: "skipped_no_identity",
} as const

const failedStatus = {
  from: "pending",
  to: "failed",
} as const

const sentStatus = {
  from: "pending",
  to: "sent",
} as const

function buildEventPayload<TChannel extends MetaConversionsChannel>(input: {
  channel: TChannel
  accessToken: string
  datasetId: string
  // Any Meta event name allowed by the row's action-source event catalog
  // (business-messaging's 14 documented events, or a Pixel standard/custom
  // name) — validated upstream by `requireEventNameAllowedForActionSource`.
  eventName: MetaCapiEventName
  actionSource: MetaCapiActionSource
  occurredAt: Date
  eventId: string
  contactInboxSourceId: string
  ctwaClid?: string | null
  value?: string | null
  currency?: string | null
  contentCategory?: string | null
  contentName?: string | null
  contentType?: MetaCapiContentType | null
  contentIds?: string[] | null
  // Always populated by the caller (`hashContactUserData` always emits at
  // least `external_id`) — required so a non-messaging identity can never be
  // built without hashed customer info to identify the person by.
  userData: HashedCapiUserData
  limitedDataUse?: boolean
  integration: MetaConversionsIntegrationByChannel[TChannel]
}) {
  const policy = metaCapiActionSourcePolicy[input.actionSource]

  // Only `business_messaging` identifies the person by their per-channel
  // messaging id (page-scoped id / IG sid / ctwa_clid); every other action
  // source identifies them via hashed customer info only (`userData` below)
  // — `NonMessagingIdentity` on the integration side.
  const identity = policy.usesMessagingIdentity
    ? buildChannelIdentity(
        input.channel,
        input.integration,
        resolveContactMessagingId(input.channel, {
          sourceId: input.contactInboxSourceId,
          ctwaClid: input.ctwaClid,
        }),
      )
    : {
        // Structurally safe even though TS can't derive it from the boolean
        // lookup: `usesMessagingIdentity` is true only for
        // `business_messaging` (see `metaCapiActionSourcePolicy`), so this
        // branch's `actionSource` is never `business_messaging`.
        actionSource: input.actionSource as Exclude<
          MetaCapiActionSource,
          "business_messaging"
        >,
      }

  return {
    datasetId: input.datasetId,
    accessToken: input.accessToken,
    event: {
      eventName: input.eventName,
      occurredAt: input.occurredAt,
      eventId: input.eventId,
      ...identity,
      // Hashed customer info rides along for every action source; for a
      // non-messaging source it is the only identity Meta receives.
      userData: input.userData,
      ...(input.value ? { value: input.value } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.contentCategory
        ? { contentCategory: input.contentCategory }
        : {}),
      ...(input.contentName ? { contentName: input.contentName } : {}),
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.contentIds && input.contentIds.length > 0
        ? { contentIds: input.contentIds }
        : {}),
      ...(input.limitedDataUse ? { limitedDataUse: input.limitedDataUse } : {}),
    },
  }
}

/**
 * The Events Manager `test_event_code` to send with this event, if any. A
 * "Send test event" must never reach production reporting, so for a
 * `manualTest` event the integration row is re-read right here — after all
 * other pre-send work — so a clear that raced the job is honoured; every
 * other event uses the row already loaded for the send.
 */
async function resolveTestEventCode(
  event: Pick<
    MetaCapiEventModel,
    "source" | "channel" | "integrationId" | "workspaceId"
  >,
  integration: { capiTestEventCode: string | null },
): Promise<string | undefined> {
  if (event.source !== "manualTest") {
    return integration.capiTestEventCode ?? undefined
  }
  const latest = await findEventIntegration(event.channel, {
    integrationId: event.integrationId,
    workspaceId: event.workspaceId,
  })
  return latest?.capiTestEventCode ?? undefined
}

export async function handleSendMetaCapiEvent(
  data: SendMetaCapiEventData,
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const event = await metaConversionsService.findWorkspaceEvent({
      id: data.metaCapiEventId,
      workspaceId: data.workspaceId,
    })
    if (event?.capiStatus !== "pending") {
      return
    }

    const integration = await findEventIntegration(event.channel, {
      integrationId: event.integrationId,
      workspaceId: event.workspaceId,
    })
    if (!integration) {
      await metaConversionsService.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...failedStatus,
        capiError: "integrationNotFound",
      })
      logger.warn(
        {
          metaCapiEventId: event.id,
          workspaceId: event.workspaceId,
          channel: event.channel,
        },
        "Meta CAPI event integration not found; marked failed",
      )
      return
    }

    // A user-intent disconnect blocks the send.
    if (isCapiDisconnected(integration)) {
      await metaConversionsService.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...skippedDisconnectedStatus,
      })
      return
    }

    // Limited Data Use: read once per event, OUTSIDE the try/catch
    // below so a read failure (DB/Redis blip, workspace gone) throws and
    // propagates out of `withBlockedOwnerGuard` for a BullMQ retry instead of
    // being caught and silently sent with the wrong LDU state.
    const workspace = await workspaceService.findById({
      id: event.workspaceId,
    })

    // Hoisted out of the `try` purely so the `catch` can attribute the Error
    // Log row to the contact: `contactInbox` itself is block-scoped below and
    // the failure is reported after the block has gone. Assigned only *after*
    // the workspace/inbox guard below — see the note there.
    let contactSourceId: string | undefined
    let contactId: string | undefined

    try {
      const contactInbox = await contactInboxService.findByUncached({
        where: { id: event.contactInboxId },
      })
      if (!contactInbox) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...failedStatus,
          capiError: "contactInboxNotFound",
        })
        logger.warn(
          {
            metaCapiEventId: event.id,
            workspaceId: event.workspaceId,
            contactInboxId: event.contactInboxId,
          },
          "Meta CAPI event contact inbox not found; marked failed",
        )
        return
      }

      // Defense-in-depth identity check: mirrors
      // `handleSendMetaChannelConversionEvent`'s guard in
      // `send-conversion-event.ts`. `contactInbox` above is looked up by id
      // alone (no workspace/inbox scoping in the query itself), and it powers
      // the PSID/IGSID/wa_id (`contactInbox.sourceId`) — and, from Phase 2 on,
      // hashed customer-info — sent to Meta's CAPI as this contact's identity.
      // Without this check a stale/foreign `contactInboxId` on the event would
      // leak one tenant's messaging identity (and PII) into another tenant's ad
      // dataset. `ContactInboxModel` has no direct `workspaceId` column, so
      // workspace membership is verified via the workspace-scoped
      // `contactService.findById` (returns undefined for a foreign workspace);
      // inbox membership is verified directly against the resolved
      // integration's `inboxId`.
      const contactInboxContact = await contactService.findById({
        workspaceId: event.workspaceId,
        id: contactInbox.contactId,
      })
      if (
        !contactInboxContact ||
        contactInbox.inboxId !== integration.inboxId
      ) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...failedStatus,
          capiError: "contactInboxWorkspaceMismatch",
        })
        logger.error(
          {
            metaCapiEventId: event.id,
            workspaceId: event.workspaceId,
            contactInboxId: contactInbox.id,
            contactInboxInboxId: contactInbox.inboxId,
            integrationInboxId: integration.inboxId,
          },
          "Meta CAPI event contact inbox workspace/inbox mismatch; marked failed",
        )
        return
      }

      // Only now, past the guard. `contactInbox` was looked up by id with no
      // workspace scoping, so capturing its `sourceId` any earlier means a
      // stale/foreign `contactInboxId` whose validation *throws* (rather than
      // returning undefined — a DB blip on `contactService.findById`) lands in
      // the `catch` below and persists another tenant's messaging identity into
      // this workspace's `ErrorLog`.
      contactSourceId = contactInbox.sourceId
      // Same guard, same reason — and this is the id the builder's Error Log
      // table actually renders, so a terminal failure here shows the contact
      // rather than an empty cell.
      contactId = contactInbox.contactId

      // A channel whose messaging identity is keyed to an ad click cannot
      // send without the click id, so gate BEFORE any token/scope/dataset
      // work: an unsendable event is terminally skipped_no_identity (never
      // skipped_no_scope), and no debug-token round-trip is wasted.
      if (
        capiEventRequiresCtwaClid(event.channel, event.actionSource) &&
        !contactInbox.referral?.ctwaClid
      ) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...skippedNoIdentityStatus,
        })
        return
      }

      const auth = await resolveCapiAccessTokenForChannel(
        event.channel,
        integration,
      )
      const integrationForSend =
        auth.source === "manual"
          ? integration
          : await refreshScopeCache(event.channel, integration)

      if (auth.source === "manual" && !integrationForSend.datasetId) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...skippedNoScopeStatus,
        })
        return
      }

      if (auth.source !== "manual" && !integrationForSend.hasCapiScope) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...skippedNoScopeStatus,
        })
        return
      }

      const testEventCode = await resolveTestEventCode(
        event,
        integrationForSend,
      )
      if (event.source === "manualTest" && !testEventCode) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...failedStatus,
          capiError: "testEventCodeMissing",
        })
        return
      }

      const datasetId =
        auth.source === "manual" && integrationForSend.datasetId
          ? integrationForSend.datasetId
          : await metaConversionsService.ensureDatasetId({
              channel: event.channel,
              integration: integrationForSend,
              // The adapter's `buildDatasetProvisionInput` resolves the correct
              // per-channel dataset-creation token (e.g. WhatsApp's agency
              // System User token), so this stays channel-generic.
              provisionDataset: ({ accessToken, resourceId, resourceName }) =>
                ensureDataset({
                  resourceType: capiDatasetResourceType(event.channel),
                  resourceId,
                  accessToken,
                  datasetName: buildDatasetName(resourceName),
                }),
            })

      // Customer-info matching — `contactInboxContact` was already
      // resolved and workspace/inbox-validated by the Phase 0 guard above, so
      // it is safe to hash and send.
      const userData = await hashContactUserData(contactInboxContact)

      await sendConversionEvent({
        testEventCode,
        ...buildEventPayload({
          channel: event.channel,
          accessToken: auth.accessToken,
          datasetId,
          eventName: event.eventName,
          actionSource: event.actionSource,
          occurredAt: event.occurredAt,
          eventId: event.sourceKey,
          contactInboxSourceId: contactInbox.sourceId,
          ctwaClid: contactInbox.referral?.ctwaClid,
          value: event.value,
          currency: event.currency,
          contentCategory: event.contentCategory,
          contentName: event.contentName,
          contentType: event.contentType,
          contentIds: event.contentIds,
          userData,
          limitedDataUse: workspace.capiLimitedDataUse,
          integration: integrationForSend,
        }),
      })
    } catch (error) {
      if (error instanceof Error && "retryable" in error && error.retryable) {
        throw error
      }

      await metaConversionsService.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...failedStatus,
        capiError:
          error instanceof Error
            ? error.message
            : "Meta Conversions API terminal failure",
      })
      await logProviderError({
        provider: "meta-conversions",
        workspaceId: event.workspaceId,
        contactId,
        sourceId: contactSourceId,
        error,
        httpCode: "400",
      })
      logger.warn(
        {
          metaCapiEventId: event.id,
          workspaceId: event.workspaceId,
          // Log only the message, never the raw error: a Graph HTTP error can
          // carry the request's Authorization header (the manual CAPI token).
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "Meta CAPI event marked failed",
      )
      return
    }

    await metaConversionsService.updateCapiStatus({
      id: event.id,
      workspaceId: event.workspaceId,
      ...sentStatus,
      capiSentAt: new Date(),
    })
  })
}
