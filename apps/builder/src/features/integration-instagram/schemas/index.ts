import { instagramPersistentMenuTypes } from "@chatbotx.io/database/partials"
import z from "zod"

export const selectAccountRequest = z.object({
  workspaceId: z.string().nullish(),
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
    type: z.literal(instagramPersistentMenuTypes.enum.flow),
    flowId: z.cuid2(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(instagramPersistentMenuTypes.enum.url),
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
