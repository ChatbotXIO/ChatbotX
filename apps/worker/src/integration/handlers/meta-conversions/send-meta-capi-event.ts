import {
  type CapiScopeCheckInput,
  contactInboxService,
  instagramIntegrationService,
  integrationWhatsappService,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  messengerIntegrationService,
  metaConversionsService,
  platformCredentialService,
  resolveCapiAccessToken,
  WHATSAPP_CAPI_SCOPE,
  withBlockedOwnerGuard,
  workspaceService,
} from "@chatbotx.io/business"
import {
  debugToken as debugInstagramFacebookToken,
  hasInstagramManageEventsScope,
  toAppAccessToken as toInstagramFacebookAppAccessToken,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  debugToken as debugMessengerToken,
  hasPageEventsScope,
  toAppAccessToken as toMessengerAppAccessToken,
} from "@chatbotx.io/integration-messenger"
import {
  type EnsureDatasetInput,
  ensureDataset,
  sendConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
import { debugTokenOrThrow } from "@chatbotx.io/integration-whatsapp/api/auth"
import {
  DefaultJobAction,
  defaultQueue,
  type IntegrationJobSendMetaCapiEvent,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

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

const datasetResourceTypeByChannel = {
  messenger: "page",
  instagram: "igUser",
  whatsapp: "waba",
} as const satisfies Record<
  MetaConversionsChannel,
  EnsureDatasetInput["resourceType"]
>

const integrationResolvers = {
  messenger: (input) => messengerIntegrationService.findByIdForWorkspace(input),
  instagram: (input) => instagramIntegrationService.findByIdForWorkspace(input),
  whatsapp: (input) => integrationWhatsappService.findByIdForWorkspace(input),
} satisfies {
  [TChannel in MetaConversionsChannel]: (input: {
    id: string
    workspaceId: string
  }) => Promise<
    MetaConversionsIntegrationByChannel[TChannel] | null | undefined
  >
}

async function findEventIntegration<TChannel extends MetaConversionsChannel>(
  channel: TChannel,
  input: {
    integrationId: string
    workspaceId: string
  },
): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
  const resolveIntegration = integrationResolvers[channel] as (input: {
    id: string
    workspaceId: string
  }) => Promise<
    MetaConversionsIntegrationByChannel[TChannel] | null | undefined
  >

  return (
    (await resolveIntegration({
      id: input.integrationId,
      workspaceId: input.workspaceId,
    })) ?? null
  )
}

async function checkMessengerCapiScope(
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "messenger",
  })
  if (!credential) {
    return storedHasCapiScope
  }

  const debug = await debugMessengerToken({
    inputToken: input.accessToken,
    appAccessToken: toMessengerAppAccessToken(credential.config),
    version: credential.config.version,
  })

  return hasPageEventsScope(debug.scopes)
}

async function checkInstagramCapiScope(
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "instagramFacebook",
  })
  if (!credential) {
    return storedHasCapiScope
  }

  const debug = await debugInstagramFacebookToken({
    inputToken: input.accessToken,
    appAccessToken: toInstagramFacebookAppAccessToken(credential.config),
    version: credential.config.version,
  })

  return hasInstagramManageEventsScope(debug.scopes)
}

/**
 * Worker-local WhatsApp CAPI scope check — mirrors the builder's
 * `hasWhatsappCapiScope` (apps/builder/src/features/integration-whatsapp/libs/capi-scope.ts)
 * without importing across the `@/...` app boundary. The app access token
 * comes from the workspace owner's WhatsApp platform credential
 * (`clientId|clientSecret`), same as the messenger/instagram checkers above.
 */
async function checkWhatsappCapiScope(
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "whatsapp",
  })
  if (!credential) {
    return storedHasCapiScope
  }

  const appAccessToken = `${credential.config.clientId}|${credential.config.clientSecret}`
  const token = await debugTokenOrThrow(input.accessToken, appAccessToken)
  const capiScope = token?.granular_scopes?.find(
    (scope) => scope.scope === WHATSAPP_CAPI_SCOPE,
  )
  if (!capiScope) {
    return false
  }

  return (
    !capiScope.target_ids ||
    capiScope.target_ids.length === 0 ||
    capiScope.target_ids.includes(input.resourceId)
  )
}

const scopeCheckers = {
  messenger: checkMessengerCapiScope,
  instagram: checkInstagramCapiScope,
  whatsapp: checkWhatsappCapiScope,
} satisfies {
  [TChannel in MetaConversionsChannel]: (
    input: CapiScopeCheckInput,
    storedHasCapiScope: boolean,
    workspaceId: string,
  ) => Promise<boolean>
}

async function refreshScopeCache<TChannel extends MetaConversionsChannel>(
  channel: TChannel,
  integration: MetaConversionsIntegrationByChannel[TChannel],
): Promise<MetaConversionsIntegrationByChannel[TChannel]> {
  const refreshed = await metaConversionsService.refreshCapiScopeCache({
    channel,
    integration,
    checkScope: (input) =>
      scopeCheckers[channel](
        input,
        integration.hasCapiScope,
        integration.workspaceId,
      ),
  })

  return refreshed ?? integration
}

function buildEventPayload<TChannel extends MetaConversionsChannel>(input: {
  channel: TChannel
  accessToken: string
  datasetId: string
  eventName: "LeadSubmitted"
  occurredAt: Date
  eventId: string
  contactInboxSourceId: string
  ctwaClid?: string | null
  value?: string | null
  currency?: string | null
  contentCategory?: string | null
  contentName?: string | null
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
              provisionDataset: ({ resourceId }) =>
                ensureDataset({
                  resourceType: datasetResourceTypeByChannel[event.channel],
                  resourceId,
                  accessToken: auth.accessToken,
                }),
            })

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
