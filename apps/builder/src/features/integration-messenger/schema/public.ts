import {
  messengerConversationStarterSchema,
  messengerPersistentMenuSchema,
  messengerPersonaSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { updateMessengerRequest } from "./action"

export const messengerChannelIdSchema = zodBigintAsString().describe(
  "Messenger channel (integration) id. Get it from `integrations.list`.",
)

const settingsShape = {
  welcomeFlowId: updateMessengerRequest.shape.welcomeFlowId.describe(
    "Flow sent when someone taps Get Started, or null for none. Get flow ids from `flows.list`.",
  ),
  persistentMenus: z
    .array(messengerPersistentMenuSchema)
    .describe(
      "Persistent menu items, in order: `flow` items start a flow, `url` items open a link. Empty removes the menu.",
    ),
  personas: z
    .array(messengerPersonaSchema)
    .describe(
      "Personas the page can reply as. Keep each persona's `id` to update it; one without an `id` is created, one left out is deleted from Facebook. Exactly one may be `isDefault`.",
    ),
  conversationStarters: z
    .array(messengerConversationStarterSchema)
    .describe(
      "Ice breaker questions shown in a new chat, each starting a flow. Empty removes them.",
    ),
}

export const messengerSettingsPublicResource = z.object(settingsShape)

export const updateMessengerSettingsPublicRequest = z.object({
  id: messengerChannelIdSchema,
  ...settingsShape,
  markReadOnOutbound: updateMessengerRequest.shape.markReadOnOutbound.describe(
    "Mark the conversation read whenever a message is sent from this page. Left unchanged when omitted.",
  ),
})
