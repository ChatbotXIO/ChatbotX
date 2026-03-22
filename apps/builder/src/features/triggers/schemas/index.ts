import type { TriggerModel } from "@aha.chat/database/types"
import type { ContactResource } from "@/features/contacts/schemas/resource"
import type { UserResource } from "@/features/users/schemas/resource"

export type TriggerResource = TriggerModel & {
  user?: UserResource | null
  contact?: ContactResource | null
}

export type TriggerCollection = {
  data: TriggerResource[]
  pageCount: number
}
