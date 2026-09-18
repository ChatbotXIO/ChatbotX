import { PhoneCallIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * Rendered when the Calls page query returns no rows.
 *
 * L3 fix: a FILTERED empty result ("no calls match the Missed/No reply
 * chip") is a distinct state from "no calls yet" (the workspace has never
 * had a call at all) — showing the same "get started" copy for both is
 * misleading when the workspace actually has calls, just none matching the
 * active filter.
 */
export function CallsEmptyState({
  hasActiveFilter,
}: {
  hasActiveFilter: boolean
}) {
  const t = useTranslations("whatsapp.calls.page")

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <PhoneCallIcon aria-hidden className="size-8 text-muted-foreground" />
      <p className="font-medium text-sm">
        {t(hasActiveFilter ? "emptyFilteredTitle" : "emptyTitle")}
      </p>
      <p className="max-w-sm text-muted-foreground text-sm">
        {t(hasActiveFilter ? "emptyFilteredDescription" : "emptyDescription")}
      </p>
    </div>
  )
}
