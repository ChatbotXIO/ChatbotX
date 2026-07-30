import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { SiFacebook } from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import { META_BLUE_SURFACE, META_BLUE_TEXT } from "../lib/meta-catalog-brand"
import type { MetaCatalogConnection } from "./meta-catalog-types"

const STATUS_STYLES: Record<MetaCatalogConnection["status"], string> = {
  active:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  invalid: "border-destructive/40 bg-destructive/10 text-destructive",
}

const formatDate = (value: Date | string | null): string | null =>
  value ? new Date(value).toLocaleString() : null

/**
 * Read-only identity of the linked Meta account. Everything here is decided
 * during OAuth or by the import worker, so nothing on this tab is editable —
 * the only action is disconnecting.
 */
export function MetaCatalogConnectionInfo({
  connection,
}: {
  connection: MetaCatalogConnection
}) {
  const t = useTranslations("metaCatalog")

  const rows: Array<{ key: string; label: string; value: string }> = [
    {
      key: "catalogId",
      // Not a fixed binding: each sync or import can target a different
      // catalog, so this row reports the most recent one, not "the" catalog.
      label: t("connectionInfo.lastCatalogId"),
      value: connection.catalogId ?? t("connectionInfo.unknown"),
    },
    {
      key: "businessId",
      label: t("connectionInfo.businessId"),
      value: connection.businessId ?? t("connectionInfo.unknown"),
    },
    {
      key: "authMode",
      label: t("connectionInfo.authMode"),
      value: t(`connectionInfo.authModes.${connection.authMode}`),
    },
    {
      key: "tokenExpiresAt",
      label: t("connectionInfo.tokenExpiresAt"),
      value:
        formatDate(connection.tokenExpiresAt) ?? t("connectionInfo.noExpiry"),
    },
    {
      // Kept even though the Import tab dates its result too: that callout is
      // hidden while idle or after a failure, so this stays the one place that
      // always answers "when was this account last pulled from?".
      key: "lastImportedAt",
      label: t("connectionInfo.lastImportedAt"),
      value: formatDate(connection.lastImportedAt) ?? t("connectionInfo.never"),
    },
  ]

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            META_BLUE_SURFACE,
          )}
        >
          <SiFacebook className={cn("size-5", META_BLUE_TEXT)} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Its own wording, not the table's "not available" fallback: at this
              spot the answer is a state, not a missing value — the account is
              linked, no catalog has been chosen for it yet. */}
          <p className="truncate font-medium text-sm">
            {connection.catalogName ??
              connection.catalogId ??
              t("connectionInfo.noCatalog")}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {t("connectionInfo.heading")}
          </p>
        </div>
        <Badge
          className={cn("shrink-0", STATUS_STYLES[connection.status])}
          variant="outline"
        >
          {t(`connectionInfo.connectionStatuses.${connection.status}`)}
        </Badge>
      </header>

      <dl className="divide-y rounded-lg border text-sm">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-4 px-4 py-2.5"
            key={row.key}
          >
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="truncate font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
