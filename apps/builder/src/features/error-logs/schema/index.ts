import type { ErrorLogModel } from "@chatbotx.io/database/types"
import type { ContactResource } from "@/features/contacts/schema/resource"

export type ErrorLogResource = ErrorLogModel & {
  contact?: ContactResource | null
}
