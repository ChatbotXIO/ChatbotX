"use client"

import { RadioIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function BroadcastsEmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10">
      <div className="flex size-[220px] items-center justify-center rounded-full bg-[radial-gradient(circle,var(--muted)_0%,transparent_72%)]">
        <RadioIcon
          aria-hidden="true"
          className="size-[140px] text-muted-foreground/40"
          strokeWidth={1.25}
        />
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-semibold">
          {t(
            filtered
              ? "broadcasts.empty.filteredTitle"
              : "broadcasts.empty.title",
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {t(
            filtered
              ? "broadcasts.empty.filteredDescription"
              : "broadcasts.empty.description",
          )}
        </p>
      </div>
    </div>
  )
}
