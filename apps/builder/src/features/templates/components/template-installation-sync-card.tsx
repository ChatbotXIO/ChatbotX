"use client"

import type {
  TemplateInstallationDetail as Detail,
  TemplateSyncHistoryItem,
} from "@chatbotx.io/business"
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
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { setPublisherUninstallGrantAction } from "../actions/set-publisher-uninstall-grant.action"
import { syncInstallationAction } from "../actions/sync-installation.action"
import { formatDateTime } from "../lib/format-date-time"
import { SHOW_PUBLISHER_ACCESS_OPTION } from "../lib/publisher-access-option"
import { useIdempotencyKey } from "../lib/use-idempotency-key"
import { useRefreshingAction } from "../lib/use-refreshing-action"
import { InstallAutoUpdateCell } from "./install-auto-update-cell"
import { isInstallFollowable } from "./install-state"
import { SyncHistoryList } from "./sync-history-list"
import { SyncUninstallControls } from "./sync-uninstall-controls"
import { isUninstallInProgress } from "./uninstall-state"

type TemplateInstallationSyncCardProps = {
  workspaceId: string
  detail: Detail
  history: TemplateSyncHistoryItem[]
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

  // One key per request: a retried or double-submitted click is a replay.
  const syncKey = useIdempotencyKey()
  const { execute: syncNow, isPending: isSyncing } = useRefreshingAction(
    syncInstallationAction.bind(null, workspaceId, detail.id),
    {
      // The next click is a new request, not a replay of this one.
      onSuccess: syncKey.reset,
    },
  )
  const { execute: setGrant, isPending: isSavingGrant } = useRefreshingAction(
    setPublisherUninstallGrantAction.bind(null, workspaceId, detail.id),
  )

  const isActive = isInstallFollowable(detail.status)
  const isUninstalling = isUninstallInProgress(detail.uninstallState)
  const isBusy = detail.syncInProgress || isSyncing || isUninstalling
  if (!isActive && history.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle>{t("templates.sync.title")}</CardTitle>
          <UpdateStateBadge detail={detail} />
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            <SyncUninstallControls
              detail={detail}
              isBusy={isBusy}
              workspaceId={workspaceId}
            />
            {/* A deleted template has nothing left to update from. */}
            {detail.sourceDeleted ? null : (
              <Button
                disabled={isBusy}
                onClick={() => syncNow({ idempotencyKey: syncKey.keyFor() })}
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
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {t("templates.sync.version", { version: detail.sourceVersion })}
          {detail.lastSyncedAt
            ? ` · ${t("templates.sync.lastSynced", {
                date: formatDateTime(detail.lastSyncedAt),
              })}`
            : ""}
        </p>
        {detail.sourceDeleted ? (
          <p className="text-muted-foreground text-sm">
            {t("templates.sync.sourceDeletedHint")}
          </p>
        ) : null}
        {isActive && !detail.sourceDeleted && (
          <InstallAutoUpdateCell
            autoUpdate={detail.autoUpdate}
            id="installation-auto-update"
            installationId={detail.id}
            label={t("templates.sync.autoUpdateLabel")}
            workspaceId={workspaceId}
          />
        )}
        {SHOW_PUBLISHER_ACCESS_OPTION && isActive && (
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
        <SyncHistoryList
          history={history}
          installationId={detail.id}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}

function UpdateStateBadge({ detail }: { detail: Detail }) {
  const t = useTranslations()
  if (detail.sourceDeleted) {
    return <Badge variant="outline">{t("templates.sync.sourceDeleted")}</Badge>
  }
  return detail.updateAvailable ? (
    <Badge>{t("templates.sync.updateAvailable")}</Badge>
  ) : (
    <Badge variant="outline">{t("templates.sync.upToDate")}</Badge>
  )
}
