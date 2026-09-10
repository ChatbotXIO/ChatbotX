"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PanelLeftCloseIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import {
  BROADCAST_FILTER_STATUSES,
  type BroadcastFilterStatus,
  type BroadcastStatusLabelKey,
  broadcastStatusConfig,
} from "../lib/broadcast-status"
import { broadcastsSearchParsers } from "../schema/search-parsers"

type PanelItem = {
  value: BroadcastFilterStatus | null
  labelKey: BroadcastStatusLabelKey | "broadcasts.filters.all"
  dotClassName: string
}

const PANEL_ITEMS: PanelItem[] = [
  {
    value: null,
    labelKey: "broadcasts.filters.all",
    dotClassName: "bg-primary",
  },
  ...BROADCAST_FILTER_STATUSES.map((value) => ({
    value,
    labelKey: broadcastStatusConfig[value].labelKey,
    dotClassName: broadcastStatusConfig[value].dotClassName,
  })),
]

export function BroadcastStatusPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [{ status }, setQuery] = useQueryStates(
    {
      status: broadcastsSearchParsers.status,
      page: broadcastsSearchParsers.page,
    },
    { shallow: false, clearOnDefault: true },
  )

  if (!open) {
    return null
  }

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-e bg-sidebar">
      <div className="flex h-14 items-center justify-between ps-4 pe-2">
        <h2 className="font-bold text-lg">{t("broadcasts.title")}</h2>
        <Button
          aria-label={t("broadcasts.panel.collapse")}
          onClick={() => onOpenChange(false)}
          size="icon"
          variant="ghost"
        >
          <PanelLeftCloseIcon aria-hidden="true" />
        </Button>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {PANEL_ITEMS.map((item) => {
          const isActive = status === item.value
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              key={item.value ?? "all"}
              onClick={() => {
                if (!isActive) {
                  setQuery({ status: item.value, page: 1 })
                }
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  item.dotClassName,
                )}
              />
              {t(item.labelKey)}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
