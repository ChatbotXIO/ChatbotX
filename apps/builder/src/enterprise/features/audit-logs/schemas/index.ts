import type { AuditLogModel } from "@chatbotx.io/database/types"
import type { UserResource } from "@/features/users/schemas/resource"

export type AuditLogResource = AuditLogModel & {
  user?: UserResource | null
}
