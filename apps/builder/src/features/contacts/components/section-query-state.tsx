"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Spinner while a section's data loads, a retry row when it failed, nothing otherwise. */
export const SectionQueryState = ({
  isError,
  isFetching,
  isPending,
  onRetry,
}: {
  isError: boolean
  isFetching: boolean
  isPending: boolean
  onRetry: () => Promise<unknown>
}) => {
  const t = useTranslations()

  if (isPending || isFetching) {
    return (
      <div className="flex justify-center px-2 py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 px-2 text-muted-foreground text-sm">
        <span>{t("messages.errorLoadingData")}</span>
        <Button onClick={onRetry} size="sm" type="button" variant="ghost">
          {t("actions.retry")}
        </Button>
      </div>
    )
  }

  return null
}
