import {
  TEMPLATE_MANAGE_PERMISSION,
  templateService,
} from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { getIdFromParams } from "@chatbotx.io/utils"
import { format } from "date-fns"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { InstallProgressRefresher } from "@/features/templates/components/install-progress-refresher"
import { InstallerUninstallButton } from "@/features/templates/components/installer-uninstall-button"
import { InstallsByVersion } from "@/features/templates/components/installs-by-version"
import {
  isUninstallInProgress,
  uninstallStateLabelKey,
} from "@/features/templates/components/uninstall-state"
import { UninstalledNotice } from "@/features/templates/components/uninstalled-notice"
import {
  nullAndLogOnError,
  nullOnNotFound,
} from "@/features/templates/lib/not-found-guard"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

/**
 * Who installed one of this workspace's templates: one row per installer
 * workspace, showing only its name. Ids never reach the page; the cursor and
 * the row reference are opaque.
 */
export default async function TemplateInstallersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<{ q?: string; cursor?: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const templateId = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && templateId)) {
    return notFound()
  }
  await requireWorkspacePermission(workspaceId, TEMPLATE_MANAGE_PERMISSION)
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  const { q, cursor } = await searchParams
  const actor = {
    kind: "member" as const,
    permissions: userAndWorkspace.targetWorkspaceMember.permissions,
  }
  const [template, installers, analytics] = await Promise.all([
    nullOnNotFound(
      templateService.getDetailOrFail({ workspaceId, templateId }),
      "template installers page: loading the template failed",
    ),
    nullAndLogOnError(
      templateService.listPublisherInstallations({
        workspaceId,
        templateId,
        actor,
        search: q,
        cursor,
      }),
      "template installers page: listing installers failed",
    ),
    nullAndLogOnError(
      templateService.getInstallAnalytics({ workspaceId, templateId, actor }),
      "template installers page: loading install figures failed",
    ),
  ])
  if (!template) {
    return notFound()
  }

  const t = await getTranslations()
  const base = `/space/${workspaceId}/templates/${templateId}/installers`

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("templates.title"),
            href: `/space/${workspaceId}/templates`,
          },
          { label: template.name, href: "" },
          { label: t("templates.installers.title"), href: "" },
        ]}
      />
      {installers?.items.some((row) =>
        isUninstallInProgress(row.uninstallState),
      ) ? (
        <InstallProgressRefresher />
      ) : null}
      {analytics ? (
        <InstallsByVersion
          byVersion={analytics.byVersion}
          currentVersion={template.version}
        />
      ) : null}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("templates.installers.title")}</CardTitle>
          <form action={base} className="flex items-center gap-2" method="get">
            <Input
              aria-label={t("actions.search")}
              className="h-8 w-56"
              defaultValue={q ?? ""}
              name="q"
              placeholder={t("actions.search")}
              type="search"
            />
            <Button size="sm" type="submit" variant="outline">
              {t("actions.search")}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {installers === null ? (
            <p
              className="py-6 text-center text-destructive text-sm"
              role="alert"
            >
              {t("templates.installers.loadError")}
            </p>
          ) : null}
          {installers?.items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("actions.noRecordFound")}
            </p>
          ) : null}
          {installers && installers.items.length > 0 ? (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("templates.installers.workspace")}</TableHead>
                  <TableHead>{t("templates.installers.installs")}</TableHead>
                  <TableHead>
                    {t("templates.installers.totalInstallEvents")}
                  </TableHead>
                  <TableHead>
                    {t("templates.installers.lastInstalled")}
                  </TableHead>
                  <TableHead>{t("templates.installers.version")}</TableHead>
                  <TableHead>{t("templates.installers.autoUpdate")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions.openMenu")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installers.items.map((row) => {
                  const stateLabelKey = uninstallStateLabelKey(
                    row.uninstallState,
                  )
                  return (
                    <TableRow key={row.publisherRef}>
                      <TableCell className="font-medium">
                        {row.workspaceName ?? t("templates.installers.hidden")}
                        {row.active ? null : (
                          <Badge className="ml-2" variant="secondary">
                            {t("templates.installers.uninstalled")}
                          </Badge>
                        )}
                        {stateLabelKey ? (
                          <Badge className="ml-2" variant="outline">
                            {t(stateLabelKey)}
                          </Badge>
                        ) : null}
                        {row.uninstallCounts ? (
                          <div>
                            <UninstalledNotice
                              compact
                              counts={row.uninstallCounts}
                            />
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.installCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.totalInstallEvents}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.lastInstalledAt
                          ? format(row.lastInstalledAt, "yyyy/MM/dd HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.oldestVersion === null ? (
                          "—"
                        ) : (
                          <>
                            v{row.oldestVersion}
                            {row.oldestVersion < template.version ? (
                              <Badge className="ml-2">
                                {t("templates.sync.updateAvailable")}
                              </Badge>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.autoUpdate
                          ? t("templates.installs.autoUpdateOn")
                          : t("templates.installs.autoUpdateOff")}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.active ? (
                          <InstallerUninstallButton
                            disabled={!row.eligibleForUninstall}
                            publisherRef={row.publisherRef}
                            templateId={templateId}
                            uninstallState={row.uninstallState}
                            workspaceId={workspaceId}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : null}
          {installers?.nextCursor ? (
            <div className="flex justify-end pt-3">
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), cursor: installers.nextCursor })}`}
              >
                {t("templates.installs.loadMore")}
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
