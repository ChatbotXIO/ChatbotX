import type { ContactResource } from "@/features/contacts/schemas"
import type { UserResource } from "@/features/users/schemas"
import type { Log } from "@ahachat.ai/database/types"

export type LogResource = Log & {
  user?: UserResource | null
  contact?: ContactResource | null
}

export type LogCollection = {
  data: LogResource[]
  pageCount: number
}
