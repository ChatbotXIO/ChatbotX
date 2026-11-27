"use client"

import type { TemplateSyncHistoryItem } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ArchiveRestoreIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { restoreSyncBackupAction } from "../actions/restore-sync-backup.action"
import { useErrorLabel } from "../lib/error-label"
import { formatDateTime } from "../lib/format-date-time"
import { useInvalidateAfterTemplateChange } from "../lib/use-invalidate-template-kinds"
import { useOptionalLabel } from "../lib/use-optional-label"
import { useRefreshingAction } from "../lib/use-refreshing-action"
import { SyncStatusBadge } from "./install-status-badge"
import { VersionChangeList } from "./version-change-list"

type SyncHistoryListProps = {
  workspaceId: string
  installationId: string
  history: TemplateSyncHistoryItem[]
}

/** Only what happened is told: a count of zero says nothing. */
const SYNC_COUNT_LABELS = [
  { key: "created", label: "templates.sync.countAdded" },
  { key: "updated", label: "templates.sync.countUpdated" },
  { key: "detached", label: "templates.sync.countDetached" },
  { key: "notUpdatable", label: "templates.sync.notUpdatable" },
] as const

export function SyncHistoryList({
  workspaceId,
  installationId,
  history,
}: SyncHistoryListProps) {
  const t = useTranslations()
  const { invalidateKinds } = useInvalidateAfterTemplateChange()
  const { execute: restore, isPending: isRestoring } = useRefreshingAction(
    restoreSyncBackupAction.bind(null, workspaceId, installationId),
    {
      onSuccess: ({ input }) => {
        toast.success(t("templates.sync.restored"))
        invalidateKinds(
          history
            .flatMap((sync) => sync.backups)
            .filter((backup) => backup.id === input.backupId)
            .map((backup) => backup.resourceKind),
        )
      },
    },
  )

  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("templates.sync.noHistory")}
      </p>
    )
  }
  return (
    <ul className="divide-y rounded-md border">
      {history.map((sync) => (
        <SyncRow
          isRestoring={isRestoring}
          key={sync.id}
          onRestore={(backupId) => restore({ backupId })}
          sync={sync}
        />
      ))}
    </ul>
  )
}

function SyncRow({
  sync,
  isRestoring,
  onRestore,
}: {
  sync: TemplateSyncHistoryItem
  isRestoring: boolean
  onRestore: (backupId: string) => void
}) {
  const t = useTranslations()
  const triggerLabel = useOptionalLabel("templates.sync.trigger")
  const errorLabel = useErrorLabel("templates.sync.errors")
  const countsText = SYNC_COUNT_LABELS.flatMap(({ key, label }) => {
    const count = sync.counts?.[key] ?? 0
    return count > 0 ? [t(label, { count })] : []
  }).join(" · ")

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <SyncStatusBadge status={sync.status} />
          <span className="text-muted-foreground">
            {triggerLabel(sync.trigger)}
          </span>
          {sync.appliedVersion !== null && (
            <span className="tabular-nums">
              v{sync.fromVersion ?? "?"} → v{sync.appliedVersion}
            </span>
          )}
          {/* Saves queued while it waited are applied together: say what was asked. */}
          {sync.requestedVersion !== sync.appliedVersion && (
            <span className="text-muted-foreground tabular-nums">
              {t("templates.sync.requestedVersion", {
                version: sync.requestedVersion,
              })}
            </span>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(sync.createdAt)}
        </span>
      </div>
      {countsText && <p className="text-muted-foreground">{countsText}</p>}
      {sync.changes && sync.changes.length > 0 && (
        <VersionChangeList changes={sync.changes} />
      )}
      {sync.errorCode && sync.status !== "skipped" && (
        <p className="text-destructive" role="alert">
          {errorLabel(sync.errorCode)}
        </p>
      )}
      {sync.backups.length > 0 && (
        <ul className="flex flex-col gap-1">
          {sync.backups.map((backup) => (
            <li
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1"
              key={backup.id}
            >
              <span className="truncate">
                {t("templates.sync.overwritten", {
                  name: backup.label ?? t("templates.installs.deletedResource"),
                })}
              </span>
              <Button
                disabled={isRestoring}
                onClick={() => onRestore(backup.id)}
                size="sm"
                variant="ghost"
              >
                <ArchiveRestoreIcon />
                {t("templates.sync.restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
