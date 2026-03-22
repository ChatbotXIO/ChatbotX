import type { WebhookModel } from "@aha.chat/database/types"
import type { ContactResource } from "@/features/contacts/schemas/resource"
import type { UserResource } from "@/features/users/schemas/resource"

export type WebhookResource = WebhookModel & {
  user?: UserResource | null
  contact?: ContactResource | null
}

export type WebhookCollection = {
  data: WebhookResource[]
  pageCount: number
}
