import { PersistentMenuType } from "@aha.chat/database/types"
import z from "zod"

export const selectAccountRequest = z.object({
  chatbotId: z.string().nullish(),
  igId: z.string(),
  igName: z.string(),
  igUsername: z.string(),
  pageId: z.string(),
  accessToken: z.string(),
})
export type SelectAccountRequest = z.infer<typeof selectAccountRequest>

export const conversationStarterSchema = z.object({
  question: z.string(),
  flowId: z.string(),
})
export type ConversationStarter = z.infer<typeof conversationStarterSchema>

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

export const updateInstagramRequest = z.object({
  welcomeFlowId: z.string().nullable(),
  conversationStarters: z.array(conversationStarterSchema),
  persistentMenus: z.array(persistentMenuSchema),
})
export type UpdateInstagramRequest = z.infer<typeof updateInstagramRequest>
