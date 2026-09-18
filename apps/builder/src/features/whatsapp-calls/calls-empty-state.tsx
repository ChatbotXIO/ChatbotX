import { PhoneCallIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * A filtered empty result ("no calls match this chip") is a distinct state
 * from "no calls yet" — the same "get started" copy would mislead a workspace
 * that has calls, just none matching the active filter.
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
