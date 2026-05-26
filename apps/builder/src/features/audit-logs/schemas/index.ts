import type { AuditLogModel } from "@chatbotx.io/database/types"

export type AuditLogResource = AuditLogModel & {
  user?: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}
