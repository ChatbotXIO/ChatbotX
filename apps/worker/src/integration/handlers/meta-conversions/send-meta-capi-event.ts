import {
  type CapiScopeCheckInput,
  contactInboxService,
  instagramIntegrationService,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  messengerIntegrationService,
  metaConversionsService,
  platformCredentialService,
  resolveCapiAccessToken,
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
  ensureDataset,
  sendConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
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

const failedStatus = {
  from: "pending",
  to: "failed",
} as const

const sentStatus = {
  from: "pending",
  to: "sent",
} as const

const integrationResolvers = {
  messenger: (input) => messengerIntegrationService.findByIdForWorkspace(input),
  instagram: (input) => instagramIntegrationService.findByIdForWorkspace(input),
} satisfies {
  [TChannel in MetaConversionsChannel]: (input: {
    id: string
    workspaceId: string
  }) => Promise<MetaConversionsIntegrationByChannel[TChannel] | undefined>
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
  }) => Promise<MetaConversionsIntegrationByChannel[TChannel] | undefined>

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

const scopeCheckers = {
  messenger: checkMessengerCapiScope,
  instagram: checkInstagramCapiScope,
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

    if (integration.capiDisconnectedAt) {
      await metaConversionsService.updateCapiStatus({
        id: event.id,
        workspaceId: event.workspaceId,
        ...skippedDisconnectedStatus,
      })
      return
    }

    try {
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

      const datasetId =
        auth.source === "manual" && integrationForSend.datasetId
          ? integrationForSend.datasetId
          : await metaConversionsService.ensureDatasetId({
              channel: event.channel,
              integration: integrationForSend,
              provisionDataset: ({ resourceId }) =>
                ensureDataset({
                  resourceType:
                    event.channel === "messenger" ? "page" : "igUser",
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
