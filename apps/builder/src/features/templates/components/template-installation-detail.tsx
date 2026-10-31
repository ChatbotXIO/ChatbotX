"use client"

import type {
  TemplateInstallationDetail as Detail,
  TemplateInstallationResourcePage,
  TemplateSyncHistoryItem,
} from "@chatbotx.io/business"
import type {
  TemplateInstallationStatus,
  TemplateUninstallCounts,
  TemplateUninstallRequester,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@chatbotx.io/ui/components/ui/sheet"
import { format } from "date-fns"
import { Loader2Icon, LockIcon, RotateCcwIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { retryInstallationAction } from "../actions/retry-installation.action"
import { warningLabel } from "../lib/warning-label"
import { InstallProgressRefresher } from "./install-progress-refresher"
import { TemplateInstallationSyncCard } from "./template-installation-sync-card"
import {
  isUninstallInProgress,
  uninstallStateLabelKey,
} from "./uninstall-state"
import { UninstalledNotice } from "./uninstalled-notice"

type TemplateInstallationDetailProps = {
  workspaceId: string
  detail: Detail
  resources: TemplateInstallationResourcePage
  history: TemplateSyncHistoryItem[]
  /** Who uninstalled and what became of the copies; null unless uninstalled. */
  uninstall: {
    uninstalledBy: TemplateUninstallRequester | null
    counts: TemplateUninstallCounts
  } | null
}

const STATUS_VARIANTS: Record<
  TemplateInstallationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  installing: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
  uninstalled: "secondary",
}

const IN_FLIGHT: readonly TemplateInstallationStatus[] = [
  "pending",
  "installing",
]

/** Where an installed copy can be opened, for the categories whose page is keyed by the resource id. */
const resourceHref = (
  workspaceId: string,
  category: string,
  resourceId: string,
): string | null => {
  const base = `/space/${workspaceId}`
  switch (category) {
    case "flows":
      return `${base}/flows/${resourceId}`
    case "calendars":
      return `${base}/appointment-calendars/${resourceId}/edit`
    case "webchats":
      return `${base}/webchats/${resourceId}/edit`
    case "products":
      return `${base}/products/${resourceId}/edit`
    case "sequences":
      return `${base}/sequences/${resourceId}`
    case "questionnaires":
      return `${base}/questionnaires/${resourceId}/edit`
    default:
      return null
  }
}

export function TemplateInstallationDetail({
  workspaceId,
  detail,
  resources,
  history,
  uninstall,
}: TemplateInstallationDetailProps) {
  const t = useTranslations()
  const stateLabelKey = uninstallStateLabelKey(detail.uninstallState)
  const router = useRouter()
  const listHref = `/space/${workspaceId}/templates/installs`
  const detailHref = `${listHref}/${detail.id}`

  const { execute: retry, isPending: isRetrying } = useAction(
    retryInstallationAction.bind(null, workspaceId, detail.id),
    {
      onSuccess: () => router.refresh(),
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const statusKey = `fields.status.${detail.status}` as const
  const errorKey = detail.errorCode
    ? (`templates.installs.errors.${detail.errorCode}` as const)
    : null
  const groupedResources = Object.entries(
    Object.groupBy(resources.items, (item) => item.category),
  )

  return (
    <div className="flex flex-col gap-4">
      {IN_FLIGHT.includes(detail.status) ||
      isUninstallInProgress(detail.uninstallState) ? (
        <InstallProgressRefresher />
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="truncate">{detail.templateName}</CardTitle>
            <Badge variant={STATUS_VARIANTS[detail.status]}>
              {t.has(statusKey) ? t(statusKey) : detail.status}
            </Badge>
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
          {uninstall && (
            <UninstalledNotice
              counts={uninstall.counts}
              uninstalledBy={uninstall.uninstalledBy}
            />
          )}
          {detail.status === "failed" && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              {errorKey && t.has(errorKey)
                ? t(errorKey)
                : t("templates.installs.errors.unknown")}
            </p>
          )}
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              label={t("templates.installs.installedBy")}
              value={detail.installedByName ?? t("templates.installs.viaApi")}
            />
            <Fact
              label={t("fields.createdAt.label")}
              value={format(detail.createdAt, "yyyy/MM/dd HH:mm")}
            />
            <Fact
              label={t("templates.installs.completedAt")}
              value={
                detail.completedAt
                  ? format(detail.completedAt, "yyyy/MM/dd HH:mm")
                  : "—"
              }
            />
            <Fact
              label={t("templates.installs.attempts")}
              value={String(detail.attempts)}
            />
            <Fact
              label={t("templates.installs.lastAttemptAt")}
              value={
                detail.claimedAt
                  ? format(detail.claimedAt, "yyyy/MM/dd HH:mm")
                  : "—"
              }
            />
            <Fact
              label={t("templates.installs.resources")}
              value={String(detail.resourceCount)}
            />
            <Fact
              label={t("templates.installs.autoUpdate")}
              value={
                detail.autoUpdate
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

      {detail.warningCount > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-amber-600">
              {t("templates.installs.warnings")} ({detail.warningCount})
            </CardTitle>
            <WarningsSheet detail={detail} />
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {detail.warningSummary.map((entry) => (
                <li className="max-w-full" key={entry.code}>
                  {/* Labels are whole sentences: let them wrap on a phone. */}
                  <Badge
                    className="h-auto max-w-full whitespace-normal py-1 text-left"
                    variant="outline"
                  >
                    {warningLabel(t, entry.code)} · {entry.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("templates.installs.resourcesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {groupedResources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("templates.installs.noResources")}
            </p>
          ) : (
            groupedResources.map(([category, items]) => (
              <section key={category}>
                <h3 className="mb-2 font-medium text-sm">
                  {t.has(`templates.categories.${category}`)
                    ? t(`templates.categories.${category}`)
                    : category}
                </h3>
                <ul className="divide-y rounded-md border">
                  {items?.map((item) => (
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
              </section>
            ))
          )}
          {resources.nextCursor && (
            <div className="flex justify-end">
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`${detailHref}?cursor=${resources.nextCursor}`}
              >
                {t("templates.installs.loadMore")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Link
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          href={listHref}
        >
          {t("templates.installs.backToList")}
        </Link>
      </div>
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

function WarningsSheet({ detail }: { detail: Detail }) {
  const t = useTranslations()

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button size="sm" variant="outline">
            {t("templates.installs.viewWarnings")}
          </Button>
        }
      />
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("templates.installs.warnings")}</SheetTitle>
          <SheetDescription>
            {detail.warningCount > detail.warnings.length
              ? t("templates.installs.warningsTruncated", {
                  shown: detail.warnings.length,
                  total: detail.warningCount,
                })
              : t("templates.installs.warningsHint")}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-3 px-4 pb-4">
          {detail.warnings.map((warning) => (
            <li
              className="rounded-md border p-3 text-sm"
              key={`${warning.code}|${warning.path}|${warning.value}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {warningLabel(t, warning.code)}
                </span>
                <Badge variant="outline">
                  {t.has(`templates.categories.${warning.category}`)
                    ? t(`templates.categories.${warning.category}`)
                    : warning.category}
                </Badge>
              </div>
              <p className="mt-1 break-all text-muted-foreground">
                {warning.path}
              </p>
              {warning.value && (
                <p className="mt-1 break-all">{warning.value}</p>
              )}
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
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
