import { instagramPersistentMenuTypes } from "@chatbotx.io/database/partials"
import z from "zod"

/**
 * The account is re-resolved server-side from the `ConnectSession` row
 * (`resolveConnectSession`) — the wire payload carries only the session id
 * and the account id the operator picked, cross-checked against
 * `session.targets`.
 */
export const selectAccountRequest = z.object({
  sessionId: z.string().min(1),
  igId: z.string().min(1),
})

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
