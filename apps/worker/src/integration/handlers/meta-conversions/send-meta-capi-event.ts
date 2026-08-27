import {
  contactInboxService,
  contactService,
  hashContactUserData,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  metaConversionsService,
  resolveCapiAccessToken,
  withBlockedOwnerGuard,
  workspaceService,
} from "@chatbotx.io/business"
import {
  buildDatasetName,
  ensureDataset,
  type MetaCapiEventName,
  sendConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
import type { HashedCapiUserData } from "@chatbotx.io/utils/meta-capi"
import {
  DefaultJobAction,
  defaultQueue,
  type IntegrationJobSendMetaCapiEvent,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import {
  datasetResourceType,
  findEventIntegration,
  refreshScopeCache,
} from "./capi-scope-checkers"

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
// this is a Meta constraint, not a transient failure.
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
  // Widened to MetaCapiEventName (Phase 1 schema change) so this payload
  // builder compiles against the DB row's type; actually sending "Purchase"
  // events is Phase 3 work, not implemented here.
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  contactInboxSourceId: string
  ctwaClid?: string | null
  value?: string | null
  currency?: string | null
  contentCategory?: string | null
  contentName?: string | null
  userData?: HashedCapiUserData
  limitedDataUse?: boolean
  integration: MetaConversionsIntegrationByChannel[TChannel]
}) {
  if (input.channel === "messenger") {
    const integration =
      input.integration as MetaConversionsIntegrationByChannel["messenger"]
    return {
      datasetId: input.datasetId,
      accessToken: input.accessToken,
      event: {
        eventName: input.eventName,
        occurredAt: input.occurredAt,
        eventId: input.eventId,
        messagingChannel: "messenger" as const,
        pageId: integration.pageId,
        pageScopedUserId: input.contactInboxSourceId,
        ...(input.value ? { value: input.value } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.contentCategory
          ? { contentCategory: input.contentCategory }
          : {}),
        ...(input.contentName ? { contentName: input.contentName } : {}),
        ...(input.userData ? { userData: input.userData } : {}),
        ...(input.limitedDataUse
          ? { limitedDataUse: input.limitedDataUse }
          : {}),
      },
    }
  }

  if (input.channel === "whatsapp") {
    const integration =
      input.integration as MetaConversionsIntegrationByChannel["whatsapp"]
    if (!input.ctwaClid) {
      // Defensive: the handler already gates on this via `skipped_no_identity`
      // before calling `sendConversionEvent` — this should be unreachable.
      throw new Error("Missing ctwa_clid for WhatsApp Meta CAPI event")
    }
    return {
      datasetId: input.datasetId,
      accessToken: input.accessToken,
      event: {
        eventName: input.eventName,
        occurredAt: input.occurredAt,
        eventId: input.eventId,
        messagingChannel: "whatsapp" as const,
        wabaId: integration.wabaId,
        ctwaClid: input.ctwaClid,
        ...(input.value ? { value: input.value } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.contentCategory
          ? { contentCategory: input.contentCategory }
          : {}),
        ...(input.contentName ? { contentName: input.contentName } : {}),
        ...(input.userData ? { userData: input.userData } : {}),
        ...(input.limitedDataUse
          ? { limitedDataUse: input.limitedDataUse }
          : {}),
      },
    }
  }

  const integration =
    input.integration as MetaConversionsIntegrationByChannel["instagram"]
  return {
    datasetId: input.datasetId,
    accessToken: input.accessToken,
    event: {
      eventName: input.eventName,
      occurredAt: input.occurredAt,
      eventId: input.eventId,
      messagingChannel: "instagram" as const,
      instagramBusinessAccountId: integration.igId,
      igSid: input.contactInboxSourceId,
      ...(input.value ? { value: input.value } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.contentCategory
        ? { contentCategory: input.contentCategory }
        : {}),
      ...(input.contentName ? { contentName: input.contentName } : {}),
      ...(input.userData ? { userData: input.userData } : {}),
      ...(input.limitedDataUse ? { limitedDataUse: input.limitedDataUse } : {}),
    },
  }
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

    // A user-intent disconnect blocks the send. Property guard, not a channel
    // switch: `capiDisconnectedAt` exists on every connect-capable channel, and
    // this stays correct if a channel ever lacks the column.
    if ("capiDisconnectedAt" in integration && integration.capiDisconnectedAt) {
      await metaConversionsService.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...skippedDisconnectedStatus,
      })
      return
    }

    // Limited Data Use (plan #3): read once per event, OUTSIDE the try/catch
    // below so a read failure (DB/Redis blip, workspace gone) throws and
    // propagates out of `withBlockedOwnerGuard` for a BullMQ retry instead of
    // being caught and silently sent with the wrong LDU state.
    const workspace = await workspaceService.findById({
      id: event.workspaceId,
    })

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

      // Defense-in-depth identity check (Phase 0 — Codex CRITICAL#1): mirrors
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

      // WhatsApp business-messaging CAPI cannot send without a ctwa_clid, so
      // gate BEFORE any token/scope/dataset work: an unsendable event is
      // terminally skipped_no_identity (never skipped_no_scope), and we avoid a
      // wasted debug-token round-trip when scope also happens to be missing.
      if (event.channel === "whatsapp" && !contactInbox.referral?.ctwaClid) {
        await metaConversionsService.updateCapiStatus({
          id: event.id,
          workspaceId: event.workspaceId,
          ...skippedNoIdentityStatus,
        })
        return
      }

      const auth = await resolveCapiAccessToken(integration)
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

      if (auth.source === "oauth" && !integrationForSend.hasCapiScope) {
        await metaConversionsService.updateCapiStatus({
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
              channel: event.channel,
              integration: integrationForSend,
              // The adapter's `buildDatasetProvisionInput` resolves the correct
              // per-channel dataset-creation token (e.g. WhatsApp's agency
              // System User token), so this stays channel-generic.
              provisionDataset: ({ accessToken, resourceId, resourceName }) =>
                ensureDataset({
                  resourceType: datasetResourceType(event.channel),
                  resourceId,
                  accessToken,
                  datasetName: buildDatasetName(resourceName),
                }),
            })

      // Customer-info matching (plan #1) — `contactInboxContact` was already
      // resolved and workspace/inbox-validated by the Phase 0 guard above, so
      // it is safe to hash and send.
      const userData = await hashContactUserData(contactInboxContact)

      await sendConversionEvent(
        buildEventPayload({
          channel: event.channel,
          accessToken: auth.accessToken,
          datasetId,
          eventName: event.eventName,
          occurredAt: event.occurredAt,
          eventId: event.sourceKey,
          contactInboxSourceId: contactInbox.sourceId,
          ctwaClid: contactInbox.referral?.ctwaClid,
          value: event.value,
          currency: event.currency,
          contentCategory: event.contentCategory,
          contentName: event.contentName,
          userData,
          limitedDataUse: workspace.capiLimitedDataUse,
          integration: integrationForSend,
        }),
      )
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
