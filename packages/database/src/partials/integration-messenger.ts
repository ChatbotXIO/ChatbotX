import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "./shared"

export const messengerPersistentMenuTypes = z.enum(["flow", "url"])

export const messengerPersistentMenuSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(messengerPersistentMenuTypes.enum.flow),
    flowId: zodBigintAsString(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(messengerPersistentMenuTypes.enum.url),
    url: z.url(),
  }),
])
export type MessengerPersistentMenu = z.infer<
  typeof messengerPersistentMenuSchema
>

export const messengerPersonaSchema = z.object({
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: zodBigintAsString(),
    url: z.url(),
    mode: uploadModes,
  }),
})
export type MessengerPersona = z.infer<typeof messengerPersonaSchema>

export const messengerConversationStarterSchema = z.object({
  question: z.string(),
  flowId: zodBigintAsString(),
})
export type MessengerConversationStarter = z.infer<
  typeof messengerConversationStarterSchema
>
