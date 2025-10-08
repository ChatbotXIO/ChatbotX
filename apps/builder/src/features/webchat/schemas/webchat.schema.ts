import {
  ConversationStarterType,
  type IntegrationWebchatModel,
  PersistentMenuType,
} from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"

export const conversationStarterSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(ConversationStarterType.FLOW),
    flowId: z.cuid2(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(ConversationStarterType.MESSAGE),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(ConversationStarterType.WEBSITE),
    url: z.string().url(),
  }),
])
export type ConversationStarterSchema = z.infer<
  typeof conversationStarterSchema
>

const persistentMenuSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(PersistentMenuType.FLOW),
    flowId: z.cuid2(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(PersistentMenuType.WEBSITE),
    websiteUrl: z.string().url(),
  }),
])
export type PersistentMenuSchema = z.infer<typeof persistentMenuSchema>

export const createWebchatRequest = z.object({
  name: z.string().min(1).max(40),
  welcomeFlowId: z.string().nullish(),
  authorizedDomains: z.array(
    z.object({
      value: z.string().url("Invalid domain URL"),
    }),
  ),
  conversationStarters: z.array(conversationStarterSchema),
  persistentMenus: z.array(persistentMenuSchema),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
  hideHeader: z.boolean().default(true),
  showLogo: z.boolean().default(false),
  hideMessageInput: z.boolean().default(true),
  customCss: z.string().optional(),
  enable: z.boolean().default(true),
})
export type CreateWebchatRequest = z.infer<typeof createWebchatRequest>

export const updateWebchatRequest = createWebchatRequest.partial()
export type UpdateWebchatRequest = z.infer<typeof updateWebchatRequest>

export const getWebchatRequest = createSearchParamsCache({
  sort: getSortingStateParser<IntegrationWebchatModel>(),
  perPage: parseAsInteger,
  page: parseAsInteger,
})
export type GetWebchatRequest = Awaited<
  ReturnType<typeof getWebchatRequest.parse>
> & { chatbotId: string }
