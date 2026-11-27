"use client"

import type { templateService } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { listTemplateInstallersAction } from "../actions/list-template-installers.action"
import { formatOptionalDateTime } from "../lib/format-date-time"
import {
  InstallerIssuesDialog,
  type IssuesInstaller,
} from "./installer-issues-dialog"
import { InstallerUninstallButton } from "./installer-uninstall-button"
import {
  isUninstallInProgress,
  uninstallStateLabelKey,
} from "./uninstall-state"
import { UninstalledNotice } from "./uninstalled-notice"

type Installers = Awaited<
  ReturnType<typeof templateService.listPublisherInstallations>
>
type InstallerRow = Installers["items"][number]

type LoadedInstallers = {
  items: InstallerRow[]
  nextCursor: string | null
  templateVersion: number
  byVersion: VersionCount[]
}

type VersionCount = { version: number; count: number }

type TemplateInstallersDialogProps = {
  workspaceId: string
  template: { id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The most installers the server returns in one page. */
const PAGE_LIMIT = 100

/** How often the list is re-read while an uninstall it shows is queued or running. */
const UNINSTALL_POLL_MS = 3000

/**
 * The publisher's popup for one template: which workspaces installed it, with a
 * search and the Uninstall of each installer that allowed it, and how many
 * run each version. Loaded on demand, like the share popup, and re-read while an
 * uninstall is running.
 */
export function TemplateInstallersDialog({
  workspaceId,
  template,
  open,
  onOpenChange,
}: TemplateInstallersDialogProps) {
  const t = useTranslations()
  const templateId = template?.id
  const [searchInput, setSearchInput] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [loaded, setLoaded] = useState<LoadedInstallers>()
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [issuesOf, setIssuesOf] = useState<IssuesInstaller | null>(null)
  // Only the newest request may write: a slow answer to an older search is dropped.
  const requestId = useRef(0)

  const listInstallers = useMemo(
    () =>
      listTemplateInstallersAction.bind(null, workspaceId, templateId ?? ""),
    [workspaceId, templateId],
  )

  /**
   * One page, or with `rows` the first `rows` installers read a page of at most
   * `PAGE_LIMIT` at a time, the most the server serves at once.
   */
  const load = useCallback(
    async (input: { search: string; cursor?: string; rows?: number }) => {
      const current = ++requestId.current
      setIsLoading(true)
      try {
        const items: InstallerRow[] = []
        // Only a first page carries the template-wide counts.
        let byVersion: VersionCount[] | null = null
        let cursor = input.cursor
        let page: Awaited<ReturnType<typeof listInstallers>>["data"]
        do {
          const result = await listInstallers({
            search: input.search || undefined,
            cursor,
            limit: input.rows
              ? Math.min(input.rows - items.length, PAGE_LIMIT)
              : undefined,
          })
          if (current !== requestId.current) {
            return
          }
          page = result?.data
          if (!page) {
            setFailed(true)
            return
          }
          items.push(...page.installers.items)
          byVersion ??= page.byVersion
          cursor = page.installers.nextCursor ?? undefined
        } while (input.rows && cursor && items.length < input.rows)
        const data = page
        setFailed(false)
        setLoaded((previous) => ({
          items: input.cursor ? [...(previous?.items ?? []), ...items] : items,
          nextCursor: data.installers.nextCursor,
          templateVersion: data.templateVersion,
          byVersion: byVersion ?? previous?.byVersion ?? [],
        }))
      } catch {
        if (current === requestId.current) {
          setFailed(true)
        }
      } finally {
        if (current === requestId.current) {
          setIsLoading(false)
        }
      }
    },
    [listInstallers],
  )

  useEffect(() => {
    if (!(open && templateId)) {
      return
    }
    setSearchInput("")
    setAppliedSearch("")
    setLoaded(undefined)
    load({ search: "" })
  }, [open, templateId, load])

  // Re-reads what is shown (as many rows as are loaded, not just the first
  // page), so an installer further down keeps being tracked.
  const shownCount = useRef(0)
  shownCount.current = loaded?.items.length ?? 0
  const shownSearch = useRef("")
  shownSearch.current = appliedSearch
  const refresh = useCallback(
    () =>
      load({
        search: shownSearch.current,
        rows: shownCount.current > 0 ? shownCount.current : undefined,
      }),
    [load],
  )

  // The next read is scheduled once the previous one has finished, so a slow
  // answer is never overtaken by the following request.
  // Keyed on `loaded` (a new object per answer), so every finished read
  // schedules the next one even when the loading flag flips within one render.
  useEffect(() => {
    const uninstallRunning = loaded?.items.some((row) =>
      isUninstallInProgress(row.uninstallState),
    )
    if (!(open && uninstallRunning) || isLoading) {
      return
    }
    const timer = setTimeout(refresh, UNINSTALL_POLL_MS)
    return () => clearTimeout(timer)
  }, [open, loaded, isLoading, refresh])

  const search = (event: FormEvent) => {
    event.preventDefault()
    const next = searchInput.trim()
    setAppliedSearch(next)
    load({ search: next })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{template?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <InstallersBox>
            <form className="flex items-center gap-2" onSubmit={search}>
              <Input
                aria-label={t("actions.search")}
                className="h-8 max-w-xs"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("actions.search")}
                type="search"
                value={searchInput}
              />
              <Button size="sm" type="submit" variant="outline">
                {t("actions.search")}
              </Button>
              {isLoading ? (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </form>
            <div>
              {failed ? (
                <p
                  className="py-6 text-center text-destructive text-sm"
                  role="alert"
                >
                  {t("templates.installers.loadError")}
                </p>
              ) : null}
              {!failed && loaded?.items.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground text-sm">
                  {t("actions.noRecordFound")}
                </p>
              ) : null}
              {loaded && loaded.items.length > 0 ? (
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t("templates.installers.workspace")}
                      </TableHead>
                      <TableHead>
                        {t("templates.installers.lastInstalled")}
                      </TableHead>
                      <TableHead>{t("templates.installers.version")}</TableHead>
                      <TableHead>
                        {t("templates.installers.autoUpdate")}
                      </TableHead>
                      <TableHead>
                        <span className="sr-only">{t("actions.openMenu")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loaded.items.map((row) => (
                      <InstallerRowView
                        key={row.publisherRef}
                        onRequested={refresh}
                        onShowIssues={setIssuesOf}
                        row={row}
                        templateId={template?.id ?? ""}
                        templateVersion={loaded.templateVersion}
                        workspaceId={workspaceId}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : null}
              {loaded?.nextCursor ? (
                <div className="flex justify-end pt-3">
                  <Button
                    disabled={isLoading}
                    onClick={() =>
                      load({
                        search: appliedSearch,
                        cursor: loaded.nextCursor ?? undefined,
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {t("templates.installs.loadMore")}
                  </Button>
                </div>
              ) : null}
            </div>
          </InstallersBox>
          <InstallersBox>
            <InstallsByVersion
              counts={loaded?.byVersion ?? []}
              currentVersion={loaded?.templateVersion}
            />
          </InstallersBox>
        </div>
        <InstallerIssuesDialog
          installer={issuesOf}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setIssuesOf(null)
            }
          }}
          templateId={template?.id ?? ""}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}

function InstallersBox({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      {children}
    </section>
  )
}

function InstallsByVersion({
  counts,
  currentVersion,
}: {
  counts: VersionCount[]
  currentVersion: number | undefined
}) {
  const t = useTranslations()
  if (counts.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        {t("actions.noRecordFound")}
      </p>
    )
  }
  const newestFirst = counts.toSorted(
    (left, right) => right.version - left.version,
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("templates.installers.version")}</TableHead>
          <TableHead className="text-end">
            {t("templates.installs.title")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {newestFirst.map((row) => (
          <TableRow key={row.version}>
            <TableCell className="font-medium tabular-nums">
              v{row.version}
              {row.version === currentVersion ? (
                <Badge className="ms-2" variant="outline">
                  {t("templates.versions.current")}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell className="text-end tabular-nums">{row.count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function InstallerRowView({
  row,
  workspaceId,
  templateId,
  templateVersion,
  onRequested,
  onShowIssues,
}: {
  row: InstallerRow
  workspaceId: string
  templateId: string
  templateVersion: number
  onRequested: () => void
  onShowIssues: (installer: IssuesInstaller) => void
}) {
  const t = useTranslations()
  const stateLabelKey = uninstallStateLabelKey(row.uninstallState)

  return (
    <TableRow>
      <TableCell className="font-medium">
        {row.workspaceName ?? t("templates.installers.hidden")}
        {row.installedAutomatically ? (
          <Badge
            className="ms-2"
            title={t("templates.installs.installedAutomatically")}
            variant="outline"
          >
            {t("templates.installers.automatic")}
          </Badge>
        ) : null}
        {row.active ? null : (
          <Badge className="ms-2" variant="secondary">
            {t("templates.installers.uninstalled")}
          </Badge>
        )}
        {stateLabelKey ? (
          <Badge className="ms-2" variant="outline">
            {t(stateLabelKey)}
          </Badge>
        ) : null}
        {row.uninstallCounts ? (
          <div>
            <UninstalledNotice compact counts={row.uninstallCounts} />
          </div>
        ) : null}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatOptionalDateTime(row.lastInstalledAt)}
      </TableCell>
      <TableCell className="tabular-nums">
        {row.oldestVersion === null ? (
          "—"
        ) : (
          <>
            v{row.oldestVersion}
            {row.oldestVersion < templateVersion ? (
              <Badge className="ms-2">
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
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {/* A legacy copy the reference backfill missed cannot be addressed. */}
          {row.publisherRef ? (
            <Button
              onClick={() =>
                onShowIssues({
                  publisherRef: row.publisherRef,
                  name: row.workspaceName ?? t("templates.installers.hidden"),
                })
              }
              size="sm"
              variant="ghost"
            >
              {t("templates.installers.details")}
            </Button>
          ) : null}
          {row.active ? (
            <InstallerUninstallButton
              disabled={!row.eligibleForUninstall}
              onRequested={onRequested}
              publisherRef={row.publisherRef}
              templateId={templateId}
              uninstallState={row.uninstallState}
              workspaceId={workspaceId}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}
