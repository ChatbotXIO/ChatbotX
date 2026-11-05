"use client"

import type {
  TemplateInstallationDetail as Detail,
  TemplateInstallationResourcePage,
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
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon, LockIcon, RotateCcwIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { retryInstallationAction } from "../actions/retry-installation.action"
import { useErrorLabel } from "../lib/error-label"
import { formatDateTime, formatOptionalDateTime } from "../lib/format-date-time"
import { resourceHref } from "../lib/resource-href"
import { useOptionalLabel } from "../lib/use-optional-label"
import { useRefreshingAction } from "../lib/use-refreshing-action"
import { InstallProgressRefresher } from "./install-progress-refresher"
import { isInstallWorkInProgress } from "./install-state"
import { InstallStatusBadge } from "./install-status-badge"
import { TemplateInstallationSyncCard } from "./template-installation-sync-card"
import { TemplateInstallationWarnings } from "./template-installation-warnings"
import { uninstallStateLabelKey } from "./uninstall-state"
import { UninstalledNotice } from "./uninstalled-notice"

type TemplateInstallationDetailProps = {
  workspaceId: string
  detail: Detail
  resources: TemplateInstallationResourcePage
  activeCategory: Detail["resourceSummary"][number]["category"] | undefined
  history: TemplateSyncHistoryItem[]
}

export function TemplateInstallationDetail({
  workspaceId,
  detail,
  resources,
  activeCategory,
  history,
}: TemplateInstallationDetailProps) {
  const t = useTranslations()
  const stateLabelKey = uninstallStateLabelKey(detail.uninstallState)
  const categoryLabel = useOptionalLabel("templates.categories")
  const detailHref = `/space/${workspaceId}/templates/installs/${detail.id}`

  const { execute: retry, isPending: isRetrying } = useRefreshingAction(
    retryInstallationAction.bind(null, workspaceId, detail.id),
  )

  const errorLabel = useErrorLabel("templates.installs.errors")
  // The one poller of the page: the install, a sync and an uninstall all report here.
  const isPolling = isInstallWorkInProgress({
    status: detail.status,
    hasActiveSync: detail.syncInProgress,
    uninstallState: detail.uninstallState,
  })
  const activeSummary = detail.resourceSummary.find(
    (row) => row.category === activeCategory,
  )

  return (
    <div className="flex flex-col gap-4">
      {isPolling ? <InstallProgressRefresher /> : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="truncate">{detail.templateName}</CardTitle>
            <InstallStatusBadge status={detail.status} />
          </div>
          {detail.status === "failed" && (
            <Button
              disabled={isRetrying}
              onClick={() => retry()}
              size="sm"
              variant="outline"
            >
              {isRetrying ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RotateCcwIcon />
              )}
              {t("templates.installs.retry")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stateLabelKey ? (
            <p
              className="rounded-md border bg-muted/40 p-3 text-sm"
              role="status"
            >
              {t(stateLabelKey)}
            </p>
          ) : null}
          {detail.uninstallCounts &&
          detail.uninstallCounts.blockedByReference > 0 ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              {t("templates.uninstall.blockedByReference", {
                count: detail.uninstallCounts.blockedByReference,
              })}
            </p>
          ) : null}
          {detail.uninstall && (
            <UninstalledNotice
              counts={detail.uninstall.counts}
              uninstalledBy={detail.uninstall.uninstalledBy}
            />
          )}
          {detail.status === "failed" && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              {errorLabel(detail.errorCode)}
            </p>
          )}
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              label={t("templates.installs.installedBy")}
              value={
                detail.installedByName ??
                (detail.installSource === "tenantDefault"
                  ? t("templates.installs.installedAutomatically")
                  : t("templates.installs.viaApi"))
              }
            />
            <Fact
              label={t("fields.createdAt.label")}
              value={formatDateTime(detail.createdAt)}
            />
            <Fact
              label={t("templates.installs.completedAt")}
              value={formatOptionalDateTime(detail.completedAt)}
            />
            <Fact
              label={t("templates.installs.attempts")}
              value={String(detail.attempts)}
            />
            <Fact
              label={t("templates.installs.lastAttemptAt")}
              value={formatOptionalDateTime(detail.claimedAt)}
            />
            <Fact
              label={t("templates.installs.resources")}
              value={String(detail.resourceCount)}
            />
            <Fact
              label={t("templates.installs.autoUpdate")}
              value={
                // A deleted template never updates, whatever the flag says.
                detail.autoUpdate && !detail.sourceDeleted
                  ? t("templates.installs.autoUpdateOn")
                  : t("templates.installs.autoUpdateOff")
              }
            />
          </dl>
        </CardContent>
      </Card>

      <TemplateInstallationSyncCard
        detail={detail}
        history={history}
        workspaceId={workspaceId}
      />

      {detail.installerWarningCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-700 dark:text-amber-400">
              {t("templates.installs.warnings")} ({detail.installerWarningCount}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateInstallationWarnings groups={detail.warningGroups} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("templates.installs.resourcesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.resourceSummary.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("templates.installs.noResources")}
            </p>
          ) : (
            <>
              <nav className="flex flex-wrap gap-x-5 gap-y-1 border-b">
                {detail.resourceSummary.map((row) => (
                  <Link
                    aria-current={
                      row.category === activeCategory ? "page" : undefined
                    }
                    className={cn(
                      "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2 text-sm",
                      row.category === activeCategory
                        ? "border-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    href={`${detailHref}?category=${row.category}`}
                    key={row.category}
                    scroll={false}
                  >
                    {categoryLabel(row.category)} ({row.total})
                  </Link>
                ))}
              </nav>
              {activeSummary && (
                <p className="text-muted-foreground text-sm">
                  {t("templates.installs.created")}: {activeSummary.created} ·{" "}
                  {t("templates.installs.reused")}: {activeSummary.reused}
                </p>
              )}
              <ul className="divide-y rounded-md border">
                {resources.items.map((item) => (
                  <li
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    key={item.id}
                  >
                    <ResourceLabel
                      href={
                        item.label
                          ? resourceHref(
                              workspaceId,
                              item.category,
                              item.resourceId,
                            )
                          : null
                      }
                      label={
                        item.label ?? t("templates.installs.deletedResource")
                      }
                    />
                    <span className="flex flex-none items-center gap-2">
                      {item.locked && (
                        <Badge variant="secondary">
                          <LockIcon />
                          {t("templates.installs.viewOnly")}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {item.created
                          ? t("templates.installs.created")
                          : t("templates.installs.reused")}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function ResourceLabel({
  href,
  label,
}: {
  href: string | null
  label: string
}) {
  if (!href) {
    return <span className="truncate">{label}</span>
  }
  return (
    <Link className="truncate hover:underline" href={href}>
      {label}
    </Link>
  )
}
