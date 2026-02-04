import { PersistentMenuType, UploadMode } from "@aha.chat/database/types"
import z from "zod"

export const selectPageRequest = z.object({
  chatbotId: z.string().nullish(),
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>

export const greetingMessage = z.object({
  language: z.string(),
  text: z.string(),
})
export type GreetingMessage = z.infer<typeof greetingMessage>

export const persona = z.object({
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: z.cuid2(),
    url: z.url(),
    mode: z.enum(UploadMode),
  }),
  facebookPersonaId: z.string().optional(),
})
export type Persona = z.infer<typeof persona>

export const conversationStarterSchema = z.object({
  question: z.string(),
  flowId: z.string(),
})
export type ConversationStarterSchema = z.infer<
  typeof conversationStarterSchema
>

const persistentMenuSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(PersistentMenuType.flow),
    flowId: z.cuid2(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(PersistentMenuType.website),
    url: z.url(),
  }),
])
export type PersistentMenuSchema = z.infer<typeof persistentMenuSchema>

export const updateMessengerRequest = z.object({
  addLanguage: z.string().optional(),
  welcomeFlowId: z.string().nullable(),
  greetingMessages: z.array(greetingMessage),
  persistentMenus: z.array(persistentMenuSchema),
  personas: z.array(persona),
  conversationStarters: z.array(conversationStarterSchema),
})

export type UpdateMessengerRequest = z.infer<typeof updateMessengerRequest>
