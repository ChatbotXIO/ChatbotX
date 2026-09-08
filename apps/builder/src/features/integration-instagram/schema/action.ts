import { instagramPersistentMenuTypes } from "@chatbotx.io/database/partials"
import z from "zod"

/**
 * `workspaceId` never travels on the wire — the connect action re-derives it
 * from the encrypted pending-auth cookie via `resolveConnectSession` (plan
 * §2.4/§4.7). The account itself is re-resolved server-side from
 * `getInstagramAccount(cookie.userToken)` and cross-checked against `igId`
 * (plan §3.3) — the wire payload carries nothing more than the id the
 * operator picked.
 */
export const selectAccountRequest = z.object({
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
