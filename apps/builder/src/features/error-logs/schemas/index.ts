import type { ErrorLogModel } from "@aha.chat/database/types"
import type { ContactResource } from "@/features/contacts/schemas/resource"

export type ErrorLogResource = ErrorLogModel & {
  contact?: ContactResource | null
}
