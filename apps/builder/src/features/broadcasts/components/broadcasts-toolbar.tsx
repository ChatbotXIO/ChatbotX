"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import {
  CalendarIcon,
  ListIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useEffect, useRef, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { BROADCAST_VIEWS, type BroadcastView } from "../lib/broadcast-status"
import { broadcastsSearchParsers } from "../schema/search-parsers"

const SEARCH_DEBOUNCE_MS = 300

const isBroadcastView = (value: string | undefined): value is BroadcastView =>
  (BROADCAST_VIEWS as readonly string[]).includes(value ?? "")

export function BroadcastsToolbar({
  panelOpen,
  onOpenPanel,
}: {
  panelOpen: boolean
  onOpenPanel: () => void
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [{ name, view }, setQuery] = useQueryStates(
    {
      name: broadcastsSearchParsers.name,
      page: broadcastsSearchParsers.page,
      view: broadcastsSearchParsers.view,
    },
    { shallow: false, clearOnDefault: true },
  )
  const [search, setSearch] = useState(name ?? "")
  const lastCommittedName = useRef<string | null>(name)
  const commitSearch = useDebouncedCallback((value: string) => {
    const next = value || null
    lastCommittedName.current = next
    setQuery({ name: next, page: 1 })
  }, SEARCH_DEBOUNCE_MS)

  // `name` can change outside this toolbar (back/forward, a deep link, or
  // the panel resetting page/status). Only resync the input when the URL
  // value differs from what this toolbar itself last committed, so we never
  // clobber in-progress typing with the debounced update it is about to send.
  useEffect(() => {
    if (name !== lastCommittedName.current) {
      lastCommittedName.current = name
      setSearch(name ?? "")
    }
  }, [name])

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b bg-background px-6">
      <div className="flex items-center gap-2">
        {!panelOpen && (
          <Button
            aria-label={t("broadcasts.panel.expand")}
            onClick={onOpenPanel}
            size="icon"
            variant="ghost"
          >
            <PanelLeftOpenIcon aria-hidden="true" />
          </Button>
        )}
        <div className="relative w-[400px] max-w-full">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("actions.search")}
            className="bg-muted ps-9"
            onChange={(event) => {
              setSearch(event.target.value)
              commitSearch(event.target.value)
            }}
            placeholder={t("actions.search")}
            value={search}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ToggleGroup
          onValueChange={(vals) => {
            const next = vals[0]
            if (isBroadcastView(next) && next !== view) {
              setQuery({ view: next })
            }
          }}
          value={[view]}
          variant="outline"
        >
          <ToggleGroupItem className="px-4" value="table">
            <ListIcon />
            {t("broadcasts.views.table")}
          </ToggleGroupItem>
          <ToggleGroupItem className="px-4" value="calendar">
            <CalendarIcon />
            {t("broadcasts.views.calendar")}
          </ToggleGroupItem>
        </ToggleGroup>

        <Link
          className={buttonVariants()}
          href={`/space/${workspaceId}/broadcasts/create`}
        >
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.broadcast.label") })}
        </Link>
      </div>
    </header>
  )
}
