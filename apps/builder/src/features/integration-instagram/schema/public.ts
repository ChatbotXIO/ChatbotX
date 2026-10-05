import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { updateInstagramRequest } from "./action"

export const instagramChannelIdSchema = zodBigintAsString().describe(
  "Instagram channel (integration) id. Get it from `instagramChannels.list`.",
)

const settingsShape = {
  welcomeFlowId: updateInstagramRequest.shape.welcomeFlowId.describe(
    "Flow sent to someone opening a chat for the first time, or null for none. Get flow ids from `flows.list`.",
  ),
  conversationStarters:
    updateInstagramRequest.shape.conversationStarters.describe(
      "Ice breaker questions shown in a new chat, each starting a flow. Empty removes them.",
    ),
  persistentMenus: updateInstagramRequest.shape.persistentMenus.describe(
    "Persistent menu items, in order: `flow` items start a flow, `url` items open a link. Empty removes the menu.",
  ),
}

export const instagramSettingsPublicResource = z.object(settingsShape)

export const updateInstagramSettingsPublicRequest = z.object({
  id: instagramChannelIdSchema,
  ...settingsShape,
  markReadOnOutbound: updateInstagramRequest.shape.markReadOnOutbound.describe(
    "Mark the conversation read whenever a message is sent from this account. Left unchanged when omitted.",
  ),
})
