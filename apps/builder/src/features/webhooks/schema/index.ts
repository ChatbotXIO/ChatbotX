import type { WebhookModel } from "@chatbotx.io/database/types"
import type { ContactResource } from "@/features/contacts/schema/resource"
import type { UserResource } from "@/features/users/schema/resource"

export type WebhookResource = WebhookModel & {
  user?: UserResource | null
  contact?: ContactResource | null
}

export type WebhookCollection = {
  data: WebhookResource[]
  pageCount: number
}
