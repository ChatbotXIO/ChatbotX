import type { AuditLogModel } from "@aha.chat/database/types"
import type { UserResource } from "@/features/users/schemas/resource"

export type AuditLogResource = AuditLogModel & {
  user?: UserResource | null
}
