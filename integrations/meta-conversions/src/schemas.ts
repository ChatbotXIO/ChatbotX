import { z } from "zod"

export const metaMessagingChannelSchema = z.enum([
  "messenger",
  "instagram",
  "whatsapp",
])
export type MetaMessagingChannel = z.infer<typeof metaMessagingChannelSchema>

export {
  type MetaCapiEventName,
  metaCapiEventNameSchema,
} from "@chatbotx.io/utils/meta-capi"
