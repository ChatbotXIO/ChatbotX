"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, PackageSearch } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

export type MetaCatalogProductOption = {
  retailerId: string
  name: string
  imageUrl: string | null
}

type MetaCatalogProductSelectProps = {
  value?: string
  onChange: (option: MetaCatalogProductOption | undefined) => void
  /** Retailer ids already picked elsewhere (other MPM product slots) that must not be offered again. */
  excludeRetailerIds?: string[]
  placeholder?: string
  /** Shows an entry that clears the selection back to "no value" (catalog default). */
  allowClear?: boolean
}

const SEARCH_DEBOUNCE_MS = 300

function ProductThumbnail({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <PackageSearch className="size-3.5" />
      </div>
    )
  }

  return (
    <Image
      alt=""
      className="size-6 shrink-0 rounded object-cover"
      height={24}
      src={imageUrl}
      width={24}
    />
  )
}

export function MetaCatalogProductSelect({
  value,
  onChange,
  excludeRetailerIds,
  placeholder,
  allowClear = true,
}: MetaCatalogProductSelectProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [debouncedKeyword, setDebouncedKeyword] = useState("")
  const applyDebouncedKeyword = useDebouncedCallback(
    setDebouncedKeyword,
    SEARCH_DEBOUNCE_MS,
  )

  const handleKeywordChange = (next: string) => {
    setKeyword(next)
    applyDebouncedKeyword(next)
  }

  // Keyed by workspace + debounced keyword: reopening the popover with an
  // unchanged keyword serves the cached result instead of re-hitting the
  // API, and out-of-order responses can never overwrite a newer keystroke's
  // results (each keyword is its own cache entry). `placeholderData:
  // keepPreviousData` keeps the previous list on screen while a new keyword
  // is in flight instead of flashing empty.
  const search = useQuery(
    orpc.whatsappMessageTemplateAPIs.searchMetaCatalogProductsAPI.queryOptions({
      input: { workspaceId, keyword: debouncedKeyword.trim() || undefined },
      enabled: open && Boolean(workspaceId),
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    }),
  )

  const items = search.data?.items ?? []
  const connected = search.data?.connected ?? true
  const loading = search.isLoading
  const hasSearched = search.data !== undefined || search.error !== undefined

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.retailerId === value ||
          !excludeRetailerIds?.includes(item.retailerId),
      ),
    [items, excludeRetailerIds, value],
  )

  const selectedOption = items.find((item) => item.retailerId === value)
  const triggerLabel =
    selectedOption?.name ??
    (value
      ? t("whatsapp.messageTemplate.params.catalogSelectedProductFallback", {
          retailerId: value,
        })
      : (placeholder ?? t("actions.pleaseSelect")))

  const handleSelect = (option: MetaCatalogProductOption) => {
    // A stale open list can still show an option another MPM slot claimed in
    // the meantime — revalidate the exclusion at selection time.
    if (
      option.retailerId !== value &&
      excludeRetailerIds?.includes(option.retailerId)
    ) {
      return
    }
    onChange(option)
    setOpen(false)
  }

  const handleClear = () => {
    onChange(undefined)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-between font-normal"
            type="button"
            variant="outline"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-start">
              {selectedOption && (
                <ProductThumbnail imageUrl={selectedOption.imageUrl} />
              )}
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={handleKeywordChange}
            placeholder={t(
              "whatsapp.messageTemplate.params.catalogProductIdPlaceholder",
            )}
            value={keyword}
          />
          <CommandList>
            {!connected && hasSearched ? (
              <div className="space-y-2 p-4 text-center text-xs">
                <p className="text-muted-foreground">
                  {t(
                    "whatsapp.messageTemplate.params.catalogNotConnectedGuidance",
                  )}
                </p>
                <Button size="sm" variant="link">
                  <Link href={`/space/${workspaceId}/products`}>
                    {t("whatsapp.messageTemplate.params.catalogSetupLink")}
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {loading
                    ? t("messages.loadingData")
                    : t("actions.noRecordFound")}
                </CommandEmpty>
                <CommandGroup>
                  {allowClear && value && (
                    <CommandItem onSelect={handleClear} value="__clear__">
                      {t("whatsapp.messageTemplate.params.catalogUseDefault")}
                    </CommandItem>
                  )}
                  {visibleItems.map((item) => (
                    <CommandItem
                      key={item.retailerId}
                      onSelect={() => handleSelect(item)}
                      value={item.retailerId}
                    >
                      <ProductThumbnail imageUrl={item.imageUrl} />
                      <span className="flex-1 truncate">{item.name}</span>
                      <Check
                        className={
                          item.retailerId === value
                            ? "ms-auto size-4 opacity-100"
                            : "ms-auto size-4 opacity-0"
                        }
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
