import { logger } from "../../../lib/logger"
import { messengerChannel } from "./channels/messenger"
import { zaloChannel } from "./channels/zalo"
import { createLabelledContact } from "./create-contact"
import { applyEvent } from "./sync"
import type { Channel, ChannelLabelWebhookData, ChannelType } from "./types"

export type { ChannelLabelWebhookData } from "./types"

/**
 * Channel registry. Add a new channel by implementing a `Channel` and
 * registering it here — nothing else in this folder needs to change.
 */
const CHANNELS: Record<ChannelType, Channel> = {
  messenger: messengerChannel,
  zalo: zaloChannel,
}

/**
 * Single entry point for every inbox-label webhook (mirror channel labels/tags
 * into local tags). Flow: resolve channel → load context → normalize payload to
 * events → apply each event via the shared core.
 */
export async function handleChannelLabelWebhook(
  data: ChannelLabelWebhookData,
): Promise<void> {
  const channel = CHANNELS[data.integrationType]
  if (!channel) {
    logger.warn(
      { channel: data.integrationType },
      "inbox labels: unsupported channel",
    )
    return
  }

  // null → integration not found OR tag sync disabled (the channel logs why)
  const loaded = await channel.loadContext(data.integrationIdentifier)
  if (!loaded) {
    return
  }
  const ctx = channel.createsMissingContacts
    ? {
        ...loaded,
        createMissingContact: (sourceId: string) =>
          createLabelledContact({
            integrationType: data.integrationType,
            integrationIdentifier: data.integrationIdentifier,
            sourceId,
          }),
      }
    : loaded

  const events = channel.toEvents(data.payload)
  if (events === null) {
    logger.warn(
      { channel: data.integrationType },
      "inbox labels: invalid payload",
    )
    return
  }

  for (const event of events) {
    await applyEvent(ctx, event)
  }
}
