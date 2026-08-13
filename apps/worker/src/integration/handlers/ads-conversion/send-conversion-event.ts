import {
  integrationWhatsappService,
  whatsappAuthForCapiScopeSchema,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { adsConversionEventRepository } from "@chatbotx.io/database/repositories"
import {
  ensureDataset,
  sendConversionEvent,
} from "@chatbotx.io/integration-whatsapp/api/conversions"
import {
  type AdsConversionJobSendConversionEvent,
  DefaultJobAction,
  defaultQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

type SendConversionEventData = AdsConversionJobSendConversionEvent["data"]

const skippedNoScopeStatus = {
  from: "pending",
  to: "skipped_no_scope",
} as const

const failedStatus = {
  from: "pending",
  to: "failed",
} as const

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

    const integration =
      await integrationWhatsappService.findWorkspaceIntegration({
        id: event.integrationWhatsappId,
        workspaceId: event.workspaceId,
      })
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
      const datasetId = await integrationWhatsappService.ensureDatasetId({
        id: integration.id,
        workspaceId: integration.workspaceId,
        provision: ({ wabaId, accessToken }) =>
          ensureDataset({
            wabaId,
            accessToken,
            version: auth.version,
          }),
      })

      await sendConversionEvent({
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
                : "WhatsApp Conversions API terminal failure",
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
        "WhatsApp conversion event marked failed",
      )
      return
    }

    await adsConversionEventRepository.updateCapiStatus({
      id: event.id,
      workspaceId: event.workspaceId,
      from: "pending",
      to: "sent",
      capiSentAt: new Date(),
    })
  })
}
