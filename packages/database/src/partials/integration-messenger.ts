import { z } from "zod"
import { uploadModes } from "./shared"

export const messengerGreetingMessage = z.object({
  locale: z.string(),
  text: z.string(),
})
export type MessengerGreetingMessage = z.infer<typeof messengerGreetingMessage>

export const persistentMenuType = z.enum(["flow", "url"])

export const messengerPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.flow),
    flowId: z.bigint(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.url),
    url: z.url(),
  }),
])
export type MessengerPersistentMenu = z.infer<typeof messengerPersistentMenu>

export const messengerPersona = z.object({
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: z.bigint(),
    url: z.url(),
    mode: uploadModes,
  }),
  facebookPersonaId: z.string().optional(),
})
export type MessengerPersona = z.infer<typeof messengerPersona>

export const messengerConversationStarter = z.object({
  question: z.string(),
  flowId: z.bigint(),
})
export type MessengerConversationStarter = z.infer<
  typeof messengerConversationStarter
>
