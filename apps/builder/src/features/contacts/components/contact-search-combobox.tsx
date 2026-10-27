"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, type ReactNode, useId, useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { contactDisplayName } from "../lib/contact-display-name"
import { ContactAvatar } from "./contact-avatar"

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZE = 10

/** The contact a search result resolves to. */
export type ContactSearchResult = {
  id: string
  name: string
  avatar: string | null
  createdAt: Date | null
}

type ContactSearchComboboxProps = {
  workspaceId: string
  /** Searching starts only while enabled (e.g. its sheet is open). */
  enabled?: boolean
  onSelect: (contact: ContactSearchResult) => void
  /** Extra text at the end of each option, e.g. how long ago it was created. */
  renderMeta?: (contact: ContactSearchResult) => ReactNode
  pageSize?: number
  autoFocus?: boolean
}

/**
 * Search the workspace's contacts by name, email, phone or contact id and pick
 * one. An inline listbox (not a popover) so results stay visible in sheets;
 * ↑/↓ move the active option and Enter picks it.
 */
export function ContactSearchCombobox({
  workspaceId,
  enabled = true,
  onSelect,
  renderMeta,
  pageSize = DEFAULT_PAGE_SIZE,
  autoFocus = false,
}: ContactSearchComboboxProps) {
  const t = useTranslations("contacts.search")
  const tActions = useTranslations("actions")
  const listboxId = useId()
  const [keyword, setKeyword] = useState("")
  const [debounced, setDebounced] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)

  const applyKeyword = useDebouncedCallback((next: string) => {
    setDebounced(next.trim())
  }, SEARCH_DEBOUNCE_MS)

  const contacts = useQuery(
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({
      input: {
        workspaceId,
        keyword: debounced || undefined,
        page: 1,
        perPage: pageSize,
      },
      enabled,
    }),
  )
  const results: ContactSearchResult[] = (contacts.data?.data ?? []).map(
    (row) => ({
      id: row.id,
      name: contactDisplayName(row) ?? row.id,
      avatar: row.avatar ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
    }),
  )
  // A shorter result list (new keyword, refetch) can leave the index past its end.
  const active = activeIndex < results.length ? activeIndex : -1

  const optionId = (index: number) => `${listboxId}-option-${index}`

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex(
        (current) =>
          ((current < results.length ? current : -1) + step + results.length) %
          results.length,
      )
      return
    }
    const picked = results[active]
    if (event.key === "Enter" && picked) {
      event.preventDefault()
      onSelect(picked)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="relative">
        <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={results.length > 0}
          aria-label={t("placeholder")}
          autoFocus={autoFocus}
          className="pl-8"
          onChange={(event) => {
            setKeyword(event.target.value)
            applyKeyword(event.target.value)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          role="combobox"
          value={keyword}
        />
      </div>
      {contacts.isPending && enabled ? (
        <p className="text-muted-foreground">{t("searching")}</p>
      ) : null}
      {contacts.isError ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-destructive">{t("error")}</p>
          <Button
            onClick={() => contacts.refetch()}
            size="sm"
            variant="outline"
          >
            {tActions("retry")}
          </Button>
        </div>
      ) : null}
      {contacts.isSuccess && results.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : null}
      <div
        aria-label={t("placeholder")}
        className="grid gap-1"
        id={listboxId}
        role="listbox"
      >
        {results.map((result, index) => (
          <div
            aria-selected={index === active}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted",
              index === active && "bg-muted",
            )}
            id={optionId(index)}
            key={result.id}
            onClick={() => onSelect(result)}
            onKeyDown={(event) => event.key === "Enter" && onSelect(result)}
            onMouseEnter={() => setActiveIndex(index)}
            role="option"
            tabIndex={-1}
          >
            <ContactAvatar
              className="size-9"
              contact={{ avatar: result.avatar, channel: null }}
              name={result.name}
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {result.name}
            </span>
            {renderMeta ? (
              <span className="shrink-0 text-muted-foreground text-xs">
                {renderMeta(result)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
