import {
  CapiTestEventError,
  type MetaConversionsChannel,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  getDataset,
  sendConversionEvent,
} from "@chatbotx.io/integration-meta-conversions"
import { findCapiIntegration } from "./find-capi-integration"
import { capiDatasetProvisioner } from "./provision-capi-dataset"
import { surfaceCapiError } from "./surface-capi-error"

// The channel-generic Meta Conversions API operations behind both the builder
// actions and the public API. Authorization (super admin in the builder, the
// `channels` scope for a token) and the wording of errors stay with the caller.

type IntegrationRef = { workspaceId: string; integrationId: string }

const requireIntegration = async (
  channel: MetaConversionsChannel,
  ref: IntegrationRef,
) => {
  const integration = await findCapiIntegration(channel, {
    id: ref.integrationId,
    workspaceId: ref.workspaceId,
  })
  // Instagram Business Login channels have no Meta CAPI: they are "not found"
  // for these operations, as the builder always treated them.
  const isUnsupportedInstagram =
    channel === "instagram" &&
    integration !== null &&
    "type" in integration &&
    integration.type !== "facebook"
  if (!integration || isUnsupportedInstagram) {
    throw new ChatbotXException("Channel not found", "notFound", 404)
  }
  return integration
}

/**
 * Validates the dataset with Meta, stores it on the channel and clears a
 * user-intent disconnect (saving a dataset is the way back to connected).
 */
export async function saveCapiDataset(
  input: IntegrationRef & {
    channel: MetaConversionsChannel
    datasetId: string
    /** Message to show when Meta rejects the token; Meta's own text otherwise. */
    invalidTokenMessage?: string
  },
): Promise<void> {
  const integration = await requireIntegration(input.channel, input)
  try {
    await metaConversionsService.saveDatasetId({
      channel: input.channel,
      integration,
      datasetId: input.datasetId,
      validate: getDataset,
    })
  } catch (error) {
    surfaceCapiError(error, input.invalidTokenMessage)
  }
  await metaConversionsService.reconnectCapi({
    channel: input.channel,
    integration,
  })
}

export async function saveCapiTestEventCodeFor(
  input: IntegrationRef & {
    channel: MetaConversionsChannel
    testEventCode: string | null
  },
): Promise<void> {
  const integration = await requireIntegration(input.channel, input)
  await metaConversionsService.saveCapiTestEventCode({
    channel: input.channel,
    integration,
    testEventCode: input.testEventCode,
  })
}

/** Sends one sample Purchase to Meta's Test Events; the caller maps `CapiTestEventError`. */
export async function sendCapiTestEventFor(
  input: IntegrationRef & {
    channel: MetaConversionsChannel
    messagingId: string
  },
): Promise<void> {
  const integration = await requireIntegration(input.channel, input)
  try {
    await metaConversionsService.sendTestEvent({
      channel: input.channel,
      integration,
      messagingId: input.messagingId,
      provisionDataset: capiDatasetProvisioner(input.channel),
      send: sendConversionEvent,
    })
  } catch (error) {
    if (error instanceof CapiTestEventError) {
      throw error
    }
    surfaceCapiError(error)
  }
}
