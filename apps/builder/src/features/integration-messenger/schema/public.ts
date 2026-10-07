import {
  messengerConversationStarterSchema,
  messengerPersistentMenuSchema,
  messengerPersonaSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { updateMessengerRequest } from "./action"

export const messengerChannelIdSchema = zodBigintAsString().describe(
  "Messenger channel (integration) id. Get it from `messengerChannels.list`.",
)

/**
 * A persona as an API caller sends it: `profilePictureUrl` is enough, the
 * server fills the stored picture record like the builder form does. The
 * stored `profilePicture` shape is still accepted for callers that echo a
 * `getSettings` response back.
 */
export const messengerPersonaPublicInput = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        "Persona id from `getSettings`, to update that persona. Omit to create one.",
      ),
    name: z
      .string()
      .min(1)
      .describe("Name shown on replies sent as this persona."),
    isDefault: z
      .boolean()
      .default(false)
      .describe("Reply as this persona by default. At most one may be true."),
    profilePictureUrl: z
      .url()
      .optional()
      .describe("Public https URL of the persona's profile picture."),
    profilePicture: messengerPersonaSchema.shape.profilePicture
      .optional()
      .describe(
        "Stored picture record as `getSettings` returns it; send `profilePictureUrl` instead.",
      ),
  })
  .refine((persona) => persona.profilePictureUrl || persona.profilePicture, {
    message: "Send profilePictureUrl",
    path: ["profilePictureUrl"],
  })
export type MessengerPersonaPublicInput = z.infer<
  typeof messengerPersonaPublicInput
>

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
      "Personas the page can reply as. Exactly one may be `isDefault`.",
    ),
  conversationStarters: z
    .array(messengerConversationStarterSchema)
    .describe(
      "Ice breaker questions shown in a new chat, each starting a flow. Empty removes them.",
    ),
}

export const messengerSettingsPublicResource = z.object(settingsShape)

const personasInput = z
  .array(messengerPersonaPublicInput)
  .refine(
    (personas) => personas.filter((persona) => persona.isDefault).length <= 1,
    { message: "Only one persona can be the default" },
  )
  .describe(
    "Personas the page can reply as: `{name, profilePictureUrl, isDefault}`. Keep a persona's `id` to update it; one without an `id` is created, one left out is deleted from Facebook. At most one may be `isDefault`.",
  )

const markReadOnOutbound =
  updateMessengerRequest.shape.markReadOnOutbound.describe(
    "Mark the conversation read whenever a message is sent from this page. Left unchanged when omitted.",
  )

export const updateMessengerSettingsPublicRequest = z.object({
  id: messengerChannelIdSchema,
  ...settingsShape,
  personas: personasInput,
  markReadOnOutbound,
})

/** Only the fields to change; the others keep their saved value. */
export const patchMessengerSettingsPublicRequest = z.object({
  id: messengerChannelIdSchema,
  welcomeFlowId: settingsShape.welcomeFlowId.optional(),
  persistentMenus: settingsShape.persistentMenus.optional(),
  personas: personasInput.optional(),
  conversationStarters: settingsShape.conversationStarters.optional(),
  markReadOnOutbound,
})
