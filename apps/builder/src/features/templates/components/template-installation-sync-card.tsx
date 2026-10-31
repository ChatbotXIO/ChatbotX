"use client"

import type {
  TemplateInstallationDetail as Detail,
  TemplateSyncHistoryItem,
} from "@chatbotx.io/business"
import type { TemplateSyncStatus } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  ArchiveRestoreIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { restoreSyncBackupAction } from "../actions/restore-sync-backup.action"
import { setInstallationAutoUpdateAction } from "../actions/set-installation-auto-update.action"
import { setPublisherUninstallGrantAction } from "../actions/set-publisher-uninstall-grant.action"
import { syncInstallationAction } from "../actions/sync-installation.action"
import {
  cancelUninstallInstallationAction,
  previewUninstallInstallationAction,
  uninstallInstallationAction,
} from "../actions/uninstall-installation.action"
import { useInvalidateTemplateResourceKinds } from "../lib/use-invalidate-template-kinds"
import { InstallProgressRefresher } from "./install-progress-refresher"
import { UninstallDialog } from "./uninstall-dialog"
import { canRetryUninstall, isUninstallInProgress } from "./uninstall-state"

type TemplateInstallationSyncCardProps = {
  workspaceId: string
  detail: Detail
  history: TemplateSyncHistoryItem[]
}

const STATUS_VARIANTS: Record<
  TemplateSyncStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  running: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
  skipped: "secondary",
  cancelled: "secondary",
}

const onActionError =
  () =>
  ({ error }: { error: { serverError?: string } }) => {
    if (error.serverError) {
      toast.error(error.serverError)
    }
  }

/**
 * The installer's view of keeping a copy current: the "update available"
 * state, the auto-update switch, a manual "Update now", and the history of
 * syncs with a restore for every edited copy a sync overwrote.
 */
export function TemplateInstallationSyncCard({
  workspaceId,
  detail,
  history,
}: TemplateInstallationSyncCardProps) {
  const t = useTranslations()
  const router = useRouter()

  // One key per request: a retried or double-submitted click is a replay.
  const syncKey = useRef(crypto.randomUUID())
  const { execute: syncNow, isPending: isSyncing } = useAction(
    syncInstallationAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: () => {
        // The next click is a new request, not a replay of this one.
        syncKey.current = crypto.randomUUID()
        router.refresh()
      },
      onError: onActionError(),
    },
  )
  const { execute: setAutoUpdate, isPending: isSavingAutoUpdate } = useAction(
    setInstallationAutoUpdateAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: () => router.refresh(),
      onError: onActionError(),
    },
  )
  const queryClient = useQueryClient()
  const { invalidateKinds, invalidateAll } =
    useInvalidateTemplateResourceKinds()
  const { execute: cancelUninstall, isPending: isCancelling } = useAction(
    cancelUninstallInstallationAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: async ({ data }) => {
        if (data && data.keptPartlyRemoved > 0) {
          toast.info(
            t("templates.uninstall.keptPartlyRemoved", {
              count: data.keptPartlyRemoved,
            }),
          )
        }
        if (data && data.keptInactiveForReview > 0) {
          toast.warning(
            t("templates.uninstall.keptInactiveForReview", {
              count: data.keptInactiveForReview,
            }),
          )
        }
        if (data && data.keptHistoryRemoved > 0) {
          toast.info(
            t("templates.uninstall.keptHistoryRemoved", {
              count: data.keptHistoryRemoved,
            }),
          )
        }
        if (data && data.alreadyCommitted > 0) {
          // Past the point of no return: not given back, it finishes deleting.
          toast.info(
            t("templates.uninstall.cancelledPartial", {
              count: data.alreadyCommitted,
            }),
          )
        } else {
          toast.success(t("templates.uninstall.cancelled"))
        }
        // The copies are governed (and locked) by the template again.
        await queryClient.invalidateQueries({
          queryKey: orpc.templatesAPI.listLockedIdsAPI.key(),
        })
        // Re-activated copies come back into the lists they were removed from.
        invalidateAll()
        router.refresh()
      },
      onError: onActionError(),
    },
  )
  const { execute: setGrant, isPending: isSavingGrant } = useAction(
    setPublisherUninstallGrantAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: () => router.refresh(),
      onError: onActionError(),
    },
  )
  const { execute: restore, isPending: isRestoring } = useAction(
    restoreSyncBackupAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: ({ input }) => {
        toast.success(t("templates.sync.restored"))
        invalidateKinds(
          history
            .flatMap((sync) => sync.backups)
            .filter((backup) => backup.id === input.backupId)
            .map((backup) => backup.resourceKind),
        )
        router.refresh()
      },
      onError: onActionError(),
    },
  )

  const [isUninstallOpen, setIsUninstallOpen] = useState(false)
  const previewUninstall = useMemo(
    () => previewUninstallInstallationAction.bind(null, workspaceId, detail.id),
    [workspaceId, detail.id],
  )
  const uninstall = useMemo(
    () => uninstallInstallationAction.bind(null, workspaceId, detail.id),
    [workspaceId, detail.id],
  )

  const isActive = ["completed", "partial"].includes(detail.status)
  const uninstallActionLabel = (() => {
    if (isUninstallInProgress(detail.uninstallState)) {
      return t("templates.uninstall.inProgress")
    }
    return canRetryUninstall(detail.uninstallState)
      ? t("templates.uninstall.retry")
      : t("templates.uninstall.action")
  })()
  const isUninstalling = isUninstallInProgress(detail.uninstallState)
  const isBusy = detail.syncInProgress || isSyncing || isUninstalling
  if (!isActive && history.length === 0) {
    return null
  }

  return (
    <Card>
      {detail.syncInProgress || isUninstalling ? (
        <InstallProgressRefresher />
      ) : null}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle>{t("templates.sync.title")}</CardTitle>
          {detail.updateAvailable ? (
            <Badge>{t("templates.sync.updateAvailable")}</Badge>
          ) : (
            <Badge variant="outline">{t("templates.sync.upToDate")}</Badge>
          )}
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            {canRetryUninstall(detail.uninstallState) && (
              <Button
                disabled={isBusy || isCancelling}
                onClick={() => cancelUninstall()}
                size="sm"
                variant="outline"
              >
                {isCancelling ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <Undo2Icon />
                )}
                {t("templates.uninstall.cancelAction")}
              </Button>
            )}
            <Button
              disabled={isBusy}
              onClick={() => setIsUninstallOpen(true)}
              size="sm"
              variant="ghost"
            >
              {isUninstalling ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              {uninstallActionLabel}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => syncNow({ idempotencyKey: syncKey.current })}
              size="sm"
              variant={detail.updateAvailable ? "default" : "outline"}
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              {isBusy
                ? t("templates.sync.updating")
                : t("templates.sync.updateNow")}
            </Button>
          </div>
        )}
      </CardHeader>
      <UninstallDialog
        onOpenChange={setIsUninstallOpen}
        open={isUninstallOpen}
        preview={previewUninstall}
        uninstall={uninstall}
      />
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {t("templates.sync.version", { version: detail.sourceVersion })}
          {detail.lastSyncedAt
            ? ` · ${t("templates.sync.lastSynced", {
                date: format(detail.lastSyncedAt, "yyyy/MM/dd HH:mm"),
              })}`
            : ""}
        </p>
        {isActive && (
          <div className="flex items-center gap-2">
            <Switch
              checked={detail.autoUpdate}
              disabled={isSavingAutoUpdate}
              id="installation-auto-update"
              onCheckedChange={(checked) =>
                setAutoUpdate({ autoUpdate: Boolean(checked) })
              }
            />
            <Label
              className="cursor-pointer font-normal"
              htmlFor="installation-auto-update"
            >
              {t("templates.sync.autoUpdateLabel")}
            </Label>
          </div>
        )}
        {isActive && (
          <div className="flex items-start gap-2">
            <Switch
              checked={detail.publisherUninstallGrant}
              disabled={isSavingGrant}
              id="installation-publisher-access"
              onCheckedChange={(checked) =>
                setGrant({ granted: Boolean(checked) })
              }
            />
            <div className="flex flex-col gap-0.5">
              <Label
                className="cursor-pointer font-normal"
                htmlFor="installation-publisher-access"
              >
                {t("templates.sync.publisherAccessLabel")}
              </Label>
              <p className="text-muted-foreground text-xs">
                {t("templates.sync.publisherAccessHint")}
              </p>
            </div>
          </div>
        )}
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("templates.sync.noHistory")}
          </p>
        ) : (
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
        )}
      </CardContent>
    </Card>
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
  const statusKey = `templates.sync.status.${sync.status}` as const
  const triggerKey = `templates.sync.trigger.${sync.trigger}` as const

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANTS[sync.status]}>
            {t.has(statusKey) ? t(statusKey) : sync.status}
          </Badge>
          <span className="text-muted-foreground">
            {t.has(triggerKey) ? t(triggerKey) : sync.trigger}
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
          {format(sync.createdAt, "yyyy/MM/dd HH:mm")}
        </span>
      </div>
      {sync.counts && (
        <p className="text-muted-foreground">
          {t("templates.sync.counts", {
            created: sync.counts.created,
            updated: sync.counts.updated,
            detached: sync.counts.detached,
          })}
          {sync.counts.notUpdatable > 0
            ? ` · ${t("templates.sync.notUpdatable", { count: sync.counts.notUpdatable })}`
            : ""}
        </p>
      )}
      {sync.errorCode && sync.status !== "skipped" && (
        <p className="text-destructive" role="alert">
          {sync.errorCode}
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
