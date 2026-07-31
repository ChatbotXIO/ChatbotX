import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  HistoryIcon,
  Loader2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import {
  ACTIVE_SYNC_STATUSES,
  type MetaCatalogSyncRun,
} from "./meta-catalog-types"

/**
 * Pushes and pulls share one list, so each row has to say which it was —
 * otherwise "12/12" is ambiguous about where those products ended up.
 */
const DIRECTION_ICONS: Record<
  MetaCatalogSyncRun["direction"],
  typeof ArrowUpFromLineIcon
> = {
  push: ArrowUpFromLineIcon,
  import: ArrowDownToLineIcon,
}

const STATUS_STYLES: Record<MetaCatalogSyncRun["status"], string> = {
  queued: "border-muted-foreground/30 text-muted-foreground",
  running: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  succeeded:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
}

export function MetaCatalogHistory({
  history,
}: {
  history: MetaCatalogSyncRun[]
}) {
  const t = useTranslations("metaCatalog")

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <HistoryIcon className="size-6 opacity-60" />
        <p className="text-sm">{t("historyEmpty")}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {history.map((run) => (
        <li className="rounded-lg border p-3 text-sm" key={run.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <DirectionBadge direction={run.direction} />
                <Badge className={STATUS_STYLES[run.status]} variant="outline">
                  {ACTIVE_SYNC_STATUSES.has(run.status) ? (
                    <Loader2Icon className="animate-spin" />
                  ) : null}
                  {t(`statuses.${run.status}`)}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {new Date(run.createdAt).toLocaleString()}
              </div>
              {/* Its own line: a catalog id is a 15+ digit number, so sharing the
                  timestamp's line would wrap at some dialog widths and not at
                  others. Older runs predate the column and simply omit it. */}
              {run.catalogId ? (
                <div className="font-mono text-muted-foreground text-xs">
                  {t("historyCatalog", { id: run.catalogId })}
                </div>
              ) : null}
            </div>
            <div className="text-end tabular-nums">
              <div className="font-medium">
                {run.succeededCount}/{run.totalCount}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("historyFailures", {
                  failed: run.failedCount,
                  skipped: run.skippedCount,
                })}
              </div>
            </div>
          </div>
          <RunDiagnostics run={run} />
        </li>
      ))}
    </ul>
  )
}

function DirectionBadge({
  direction,
}: {
  direction: MetaCatalogSyncRun["direction"]
}) {
  const t = useTranslations("metaCatalog")
  const Icon = DIRECTION_ICONS[direction]
  return (
    <Badge variant="secondary">
      <Icon />
      {t(`directions.${direction}`)}
    </Badge>
  )
}

function RunDiagnostics({ run }: { run: MetaCatalogSyncRun }) {
  const t = useTranslations("metaCatalog")
  const hasDiagnostics =
    Boolean(run.error) ||
    run.itemErrors.length > 0 ||
    run.skippedItems.length > 0

  if (!hasDiagnostics) {
    return null
  }

  return (
    <details className="mt-3 border-t pt-2">
      <summary
        className={cn(
          "cursor-pointer font-medium text-muted-foreground text-xs",
          "transition-colors hover:text-foreground",
        )}
      >
        {t("diagnostics")}
      </summary>
      <div className="mt-2 space-y-1 text-muted-foreground text-xs">
        {run.error ? <p>{run.error}</p> : null}
        {run.itemErrors.map((item) => (
          <p key={`${item.retailerId}-${item.reason}`}>
            {t("itemError", { id: item.retailerId, reason: item.reason })}
          </p>
        ))}
        {run.skippedItems.map((item) => (
          <p key={`${item.productId}-${item.reason}`}>
            {t("itemSkipped", {
              id: item.productName ?? item.productId,
              reason: t(`skipReasons.${item.reason}`),
            })}
          </p>
        ))}
      </div>
    </details>
  )
}
