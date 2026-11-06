"use client"

import type {
  TemplateInstallationStatus,
  TemplateSyncStatus,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useOptionalLabel } from "../lib/use-optional-label"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const INSTALL_STATUS_VARIANTS: Record<
  TemplateInstallationStatus,
  BadgeVariant
> = {
  pending: "secondary",
  installing: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
  uninstalled: "secondary",
}

const SYNC_STATUS_VARIANTS: Record<TemplateSyncStatus, BadgeVariant> = {
  pending: "secondary",
  running: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
  skipped: "secondary",
  cancelled: "secondary",
}

export function InstallStatusBadge({
  status,
}: {
  status: TemplateInstallationStatus
}) {
  const label = useOptionalLabel("fields.status")
  return (
    <Badge variant={INSTALL_STATUS_VARIANTS[status]}>{label(status)}</Badge>
  )
}

export function SyncStatusBadge({ status }: { status: TemplateSyncStatus }) {
  const label = useOptionalLabel("templates.sync.status")
  return <Badge variant={SYNC_STATUS_VARIANTS[status]}>{label(status)}</Badge>
}
