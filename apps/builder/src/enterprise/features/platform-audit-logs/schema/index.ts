import type { AuditLogResource } from "@/enterprise/features/audit-logs/schema"

export type PlatformAuditLogResource = AuditLogResource & {
  workspace?: { id: string; name: string } | null
}

export type PlatformAuditWorkspaceOption = { id: string; label: string }
