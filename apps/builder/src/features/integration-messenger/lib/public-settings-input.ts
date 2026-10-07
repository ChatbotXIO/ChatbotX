import type { MessengerPersona } from "@chatbotx.io/database/partials"
import { createId } from "@chatbotx.io/utils"
import type { MessengerPersonaPublicInput } from "../schema/public"

/**
 * The stored persona for one an API caller sent: a bare `profilePictureUrl`
 * becomes the same `{ id, url, mode }` record the builder form creates, and a
 * missing persona `id` is left empty for `updateMessenger` to assign.
 */
export const toStoredMessengerPersona = (
  persona: MessengerPersonaPublicInput,
): MessengerPersona => ({
  id: persona.id ?? "",
  name: persona.name,
  isDefault: persona.isDefault,
  profilePicture: persona.profilePictureUrl
    ? { id: createId(), url: persona.profilePictureUrl, mode: "url" }
    : (persona.profilePicture as MessengerPersona["profilePicture"]),
})
