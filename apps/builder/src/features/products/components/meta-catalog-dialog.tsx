"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { SiFacebook } from "@icons-pack/react-simple-icons"
import { Loader2Icon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import {
  connectMetaCatalogAction,
  disconnectMetaCatalogAction,
  getMetaCatalogStateAction,
  selectMetaCatalogAction,
  syncToMetaCatalogAction,
} from "../actions/meta-catalog.action"
import { META_BLUE_SURFACE, META_BLUE_TEXT } from "../lib/meta-catalog-brand"
import { MetaCatalogCallout } from "./meta-catalog-callout"
import { MetaCatalogConnectionInfo } from "./meta-catalog-connection-info"
import { MetaCatalogCreatePanel } from "./meta-catalog-create-panel"
import { MetaCatalogHistory } from "./meta-catalog-history"
import { MetaCatalogRequirements } from "./meta-catalog-requirements"
import {
  CATALOG_TABS,
  HISTORY_ONLY_TABS,
  type MetaCatalogTab,
  resolveInitialMetaCatalogTab,
} from "./meta-catalog-tabs"
import {
  ACTIVE_SYNC_STATUSES,
  type MetaCatalogViewState,
} from "./meta-catalog-types"

const TOKEN_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000
const POLL_INTERVAL_MS = 5000
/** Meta blue — the connection is a Meta-owned surface, so the brand color leads. */

/**
 * Result of the last finished pull. Rendered from the connection's counters
 * rather than the history list because these are the numbers the import itself
 * wrote — the history tab is for comparing runs, this is for the latest one.
 */
function ImportOutcome({
  connection,
}: {
  connection: NonNullable<MetaCatalogViewState["connection"]>
}) {
  const t = useTranslations("metaCatalog")
  // A failure already speaks through the error callout below; repeating a
  // "0 of 0 imported" line above it would only add noise.
  if (
    connection.importStatus === "idle" ||
    connection.importStatus === "failed"
  ) {
    return null
  }

  return (
    <MetaCatalogCallout
      tone={connection.importStatus === "succeeded" ? "success" : "warning"}
    >
      <span>
        {t("importResult", {
          imported: connection.importedCount,
          total: connection.importTotalCount,
        })}
        {connection.lastImportedAt ? (
          <span className="ms-1 text-muted-foreground">
            ({new Date(connection.lastImportedAt).toLocaleString()})
          </span>
        ) : null}
      </span>
    </MetaCatalogCallout>
  )
}

export function MetaCatalogDialog({
  workspaceId,
  selectedProductIds,
  initialState,
}: {
  workspaceId: string
  selectedProductIds: string[]
  initialState: MetaCatalogViewState
}) {
  const t = useTranslations("metaCatalog")
  const tActions = useTranslations("actions")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSetupFlow = searchParams.get("metaCatalog") === "setup"

  const [open, setOpen] = useState(false)
  // Read at mount too, not only in `handleOpenChange`: the setup flow opens the
  // dialog through `setOpen` directly, so it never passes through that handler.
  const [tab, setTab] = useState<MetaCatalogTab>(() =>
    resolveInitialMetaCatalogTab({
      connection: initialState.connection,
      hasHistory: initialState.history.length > 0,
      hasSelection: selectedProductIds.length > 0,
      isSetupFlow,
    }),
  )
  const [state, setState] = useState<MetaCatalogViewState>(initialState)
  const [catalogId, setCatalogId] = useState(
    initialState.connection?.catalogId ?? "",
  )

  const clearSetupQuery = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.delete("metaCatalog")
    const query = nextSearchParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTab(
        resolveInitialMetaCatalogTab({
          connection: state.connection,
          hasHistory: state.history.length > 0,
          hasSelection: selectedProductIds.length > 0,
          isSetupFlow,
        }),
      )
      setOpen(true)
      return
    }
    if (isSetupFlow) {
      clearSetupQuery()
    }
    setOpen(false)
  }

  const previousImportStatus = useRef(
    initialState.connection?.importStatus ?? "idle",
  )

  const { execute: loadState } = useAction(
    getMetaCatalogStateAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          setState(data)
          setCatalogId(data.connection?.catalogId ?? "")
        }
      },
      onError: toastActionError(t("errors.load")),
    },
  )
  const connect = useAction(connectMetaCatalogAction.bind(null, workspaceId), {
    onError: toastActionError(t("errors.connect")),
  })
  const selectCatalog = useAction(
    selectMetaCatalogAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("messages.catalogSelected"))
        loadState()
        clearSetupQuery()
      },
      onError: toastActionError(t("errors.catalog")),
    },
  )
  const sync = useAction(syncToMetaCatalogAction.bind(null, workspaceId), {
    onSuccess: () => {
      toast.success(t("messages.syncStarted"))
      setTab("history")
      loadState()
    },
    onError: toastActionError(t("errors.sync")),
  })
  const disconnect = useAction(
    disconnectMetaCatalogAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("messages.disconnected"))
        setState((current) => ({ connection: null, history: current.history }))
        setCatalogId("")
        setTab("history")
        setOpen(false)
        router.refresh()
      },
      onError: toastActionError(t("errors.disconnect")),
    },
  )

  useEffect(() => {
    if (isSetupFlow) {
      setOpen(true)
    }
  }, [isSetupFlow])

  useEffect(() => {
    setState(initialState)
    setCatalogId(initialState.connection?.catalogId ?? "")
  }, [initialState])

  useEffect(() => {
    const currentStatus = state.connection?.importStatus ?? "idle"
    const wasImporting = ACTIVE_SYNC_STATUSES.has(previousImportStatus.current)
    const isImporting = ACTIVE_SYNC_STATUSES.has(currentStatus)
    if (wasImporting && !isImporting) {
      router.refresh()
    }
    previousImportStatus.current = currentStatus
  }, [router, state.connection?.importStatus])

  const hasActiveSync =
    ACTIVE_SYNC_STATUSES.has(state.connection?.importStatus ?? "") ||
    state.history.some((run) => ACTIVE_SYNC_STATUSES.has(run.status))

  useEffect(() => {
    if (!(open && hasActiveSync)) {
      return
    }
    const interval = window.setInterval(loadState, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [hasActiveSync, loadState, open])

  const connection = state.connection
  const visibleTabs = connection ? CATALOG_TABS : HISTORY_ONLY_TABS
  const tokenExpiresSoon =
    connection?.tokenExpiresAt != null &&
    new Date(connection.tokenExpiresAt).getTime() - Date.now() <
      TOKEN_EXPIRY_WARNING_MS
  /** Pushing to Meta only ever covers the rows ticked in the products table. */
  const hasSelection = selectedProductIds.length > 0

  /**
   * Both directions target the same catalog binding, so the field is shared —
   * Radix only mounts the active tab, so the duplicate id never collides.
   */
  function renderCatalogIdField() {
    return (
      <div className="grid gap-2">
        <Label htmlFor="meta-catalog-id">{t("catalogId")}</Label>
        <Input
          id="meta-catalog-id"
          inputMode="numeric"
          onChange={(event) => setCatalogId(event.target.value)}
          placeholder={t("catalogIdPlaceholder")}
          value={catalogId}
        />
        {/* Only offered when there is nothing to target yet — with an ID typed
            in, creating a second catalog is almost never what was meant. */}
        {catalogId ? null : (
          <MetaCatalogCreatePanel
            onCreated={(createdId) => {
              setCatalogId(createdId)
              loadState()
            }}
            workspaceId={workspaceId}
          />
        )}
      </div>
    )
  }

  function renderPrimaryAction() {
    if (!connection) {
      return (
        <Button disabled={connect.isPending} onClick={() => connect.execute()}>
          {connect.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SiFacebook />
          )}
          {t("connect")}
        </Button>
      )
    }
    if (tab === "sync") {
      return (
        <Button
          disabled={!(hasSelection && catalogId) || sync.isPending}
          onClick={() =>
            sync.execute({ catalogId, scope: "selected", selectedProductIds })
          }
        >
          {sync.isPending ? <Loader2Icon className="animate-spin" /> : null}
          {t("syncNow")}
        </Button>
      )
    }
    if (tab === "import") {
      return (
        <Button
          disabled={!catalogId || selectCatalog.isPending}
          onClick={() => selectCatalog.execute({ catalogId })}
        >
          {selectCatalog.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : null}
          {t("importCatalogAction")}
        </Button>
      )
    }
    return null
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button">
            <SiFacebook />
            {t("title")}
          </Button>
        }
      />

      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-6 pt-6 pb-4 sm:text-center">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {connection || state.history.length > 0 ? (
          <Tabs
            className="grid grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden"
            onValueChange={(value) => setTab(value as MetaCatalogTab)}
            value={tab}
          >
            <div className="border-b px-6">
              <TabsList className="rounded-none border-0 bg-transparent p-0 shadow-none">
                {visibleTabs.map((value) => (
                  <TabsTrigger className="py-3" key={value} value={value}>
                    {t(`tabs.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-h-48 overflow-y-auto px-6 py-6">
              {connection ? (
                <>
                  <TabsContent className="space-y-4" value="sync">
                    {connection.status === "invalid" || tokenExpiresSoon ? (
                      <MetaCatalogCallout
                        action={
                          <Button
                            onClick={() => connect.execute()}
                            size="sm"
                            variant="outline"
                          >
                            {t("reconnect")}
                          </Button>
                        }
                        tone="warning"
                      >
                        {t("reconnectWarning")}
                      </MetaCatalogCallout>
                    ) : null}

                    {hasSelection ? (
                      <MetaCatalogCallout tone="info">
                        {t("syncSelectionCount", {
                          count: selectedProductIds.length,
                        })}
                      </MetaCatalogCallout>
                    ) : (
                      <MetaCatalogCallout tone="warning">
                        {t("syncSelectionRequired")}
                      </MetaCatalogCallout>
                    )}

                    {renderCatalogIdField()}

                    <MetaCatalogRequirements />
                  </TabsContent>

                  <TabsContent className="space-y-4" value="import">
                    {ACTIVE_SYNC_STATUSES.has(connection.importStatus) ? (
                      <MetaCatalogCallout tone="info">
                        <Loader2Icon className="size-4 shrink-0 animate-spin" />
                        {connection.importTotalCount > 0
                          ? t("importProgress", {
                              imported: connection.importedCount,
                              total: connection.importTotalCount,
                            })
                          : // Meta has not answered the first page yet, so "0/0"
                            // would read as an empty catalog rather than a wait.
                            t("importQueued")}
                      </MetaCatalogCallout>
                    ) : (
                      // The counts have to outlive the run: the whole point of the
                      // import is knowing how many products arrived, and that
                      // question is asked after it finishes, not during.
                      <ImportOutcome connection={connection} />
                    )}

                    {connection.importError ? (
                      <MetaCatalogCallout
                        action={
                          connection.importStatus === "failed" ? (
                            <Button
                              disabled={selectCatalog.isPending}
                              onClick={() =>
                                selectCatalog.execute({
                                  catalogId: connection.catalogId ?? "",
                                })
                              }
                              size="sm"
                              variant="outline"
                            >
                              {t("retryImport")}
                            </Button>
                          ) : null
                        }
                        tone="danger"
                      >
                        {connection.importError}
                      </MetaCatalogCallout>
                    ) : null}

                    <p className="text-muted-foreground text-sm">
                      {t("importDescription")}
                    </p>
                    {renderCatalogIdField()}
                  </TabsContent>
                </>
              ) : null}

              <TabsContent value="history">
                <MetaCatalogHistory history={state.history} />
              </TabsContent>

              {connection ? (
                <TabsContent value="connection">
                  <MetaCatalogConnectionInfo connection={connection} />
                </TabsContent>
              ) : null}
            </div>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-full",
                META_BLUE_SURFACE,
              )}
            >
              <SiFacebook className={cn("size-6", META_BLUE_TEXT)} />
            </div>
            <p className="max-w-sm text-muted-foreground text-sm">
              {t("connectDescription")}
            </p>
          </div>
        )}

        <Separator />

        <DialogFooter className="px-6 py-4 sm:justify-center">
          <div className="flex justify-center gap-2">
            {connection && tab === "connection" ? (
              <Button
                disabled={disconnect.isPending || hasActiveSync}
                onClick={() => disconnect.execute()}
                variant="destructive"
              >
                {disconnect.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                {t("disconnect")}
              </Button>
            ) : null}
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {tActions("cancel")}
            </Button>
            {renderPrimaryAction()}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
