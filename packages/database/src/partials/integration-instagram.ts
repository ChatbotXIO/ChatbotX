import z from "zod"

export const instagramPersistentMenuTypes = z.enum(["flow", "url"])
export const instagramPersistentMenuSchema = z.discriminatedUnion("type", [
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
export type InstagramPersistentMenu = z.infer<
  typeof instagramPersistentMenuSchema
>

export const instagramConversationStarterSchema = z.object({
  question: z.string(),
  flowId: z.string(),
})
export type InstagramConversationStarter = z.infer<
  typeof instagramConversationStarterSchema
>
