import z from "zod"
import { UploadMode } from "../../../types"

export const messengerGreetingMessage = z.object({
  locale: z.string(),
  text: z.string(),
})
export type MessengerGreetingMessage = z.infer<typeof messengerGreetingMessage>

export const persistentMenuType = z.enum(["flow", "website"])

export const messengerPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.flow),
    flowId: z.cuid2(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.website),
    url: z.url(),
  }),
])
export type MessengerPersistentMenu = z.infer<typeof messengerPersistentMenu>

export const messengerPersona = z.object({
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: z.cuid2(),
    url: z.url(),
    mode: z.enum(UploadMode),
  }),
  facebookPersonaId: z.string().optional(),
})
export type MessengerPersona = z.infer<typeof messengerPersona>

export const messengerConversationStarter = z.object({
  question: z.string(),
  flowId: z.string(),
})
export type MessengerConversationStarter = z.infer<
  typeof messengerConversationStarter
>
