import type { AuditLogModel } from "@chatbotx.io/database/types"
import type { UserResource } from "@/features/users/schema/resource"

export type AuditLogResource = AuditLogModel & {
  user?: UserResource | null
}
