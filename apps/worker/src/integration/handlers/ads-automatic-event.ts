import {
  adsConversionService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
  type IntegrationJobAdsAutomaticEvent,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

export const handleAdsAutomaticEvent = async (
  data: IntegrationJobAdsAutomaticEvent["data"],
): Promise<void> => {
  const integration = await integrationWhatsappRepository.findByPhoneNumberId({
    phoneNumberId: data.phoneNumberId,
    wabaId: data.wabaId,
  })
  if (!integration) {
    logger.warn(
      {
        phoneNumberId: data.phoneNumberId,
        wabaId: data.wabaId,
        sourceEventId: data.payload.id,
      },
      "Whatsapp automatic event skipped: integration not found",
    )
    return
  }

  await withBlockedOwnerGuard(integration.workspaceId, async () => {
    const event = await adsConversionService.ingestAutomaticEvent({
      integrationWhatsappId: integration.id,
      wabaId: data.wabaId,
      workspaceId: integration.workspaceId,
      payload: data.payload,
    })
    if (!event) {
      return
    }

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.sendConversionEvent,
        data: {
          adsConversionEventId: event.id,
          workspaceId: event.workspaceId,
        },
      },
      {
        jobId: `ads-conversion-send-${event.id}`,
      },
    )
  })
}
