import type { WithheldErrorLogColumn } from "@chatbotx.io/business/error-log-columns"
import type { ErrorLogModel } from "@chatbotx.io/database/types"
import type { ContactResource } from "@/features/contacts/schema/resource"

/**
 * Mirrors what the list query actually selects: the withheld columns are
 * developer-only and never leave the server, so a component reaching for one
 * fails to compile rather than silently rendering `undefined`.
 */
export type ErrorLogResource = Omit<ErrorLogModel, WithheldErrorLogColumn> & {
  contact?: (ContactResource & { conversation?: { id: string } | null }) | null
}
