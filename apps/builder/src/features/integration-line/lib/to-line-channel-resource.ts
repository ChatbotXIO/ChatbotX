import type { IntegrationLineModel } from "@chatbotx.io/database/types"
import type { LineChannelResource } from "../schema/resource"

/** Explicit projection: `auth` and the channel secret never leave the server. */
export const toLineChannelResource = (
  row: IntegrationLineModel,
): LineChannelResource => ({
  id: row.id,
  inboxId: row.inboxId,
  channelId: row.channelId,
  name: row.name,
  basicId: row.basicId,
  pictureUrl: row.pictureUrl,
  createdAt: row.createdAt,
})
