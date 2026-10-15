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
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { formatPrice } from "@/lib/format-price"
import { orpc } from "@/lib/orpc/query"
import { ProductThumbnail } from "./product-thumbnail"

type ProductComboboxProps = {
  /** The chosen product id, or `null` for none. */
  value: string | null
  onChange: (productId: string | null) => void
  /** Shown while nothing is chosen. */
  placeholder: string
}

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 20

/**
 * Picks one product of the workspace, with search and paging. Channel neutral:
 * it lists the workspace's own products, not what a channel can send. Leaving it
 * empty is a valid answer, which is why the choice can be cleared.
 */
export function ProductCombobox({
  value,
  onChange,
  placeholder,
}: ProductComboboxProps) {
  const tActions = useTranslations("actions")
  const tMessages = useTranslations("messages")
  const workspaceId = useWorkspaceId()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [debouncedKeyword, setDebouncedKeyword] = useState("")
  const [page, setPage] = useState(1)
  const applyKeyword = useDebouncedCallback((next: string) => {
    setDebouncedKeyword(next)
    setPage(1)
  }, SEARCH_DEBOUNCE_MS)

  const handleKeywordChange = (next: string) => {
    setKeyword(next)
    applyKeyword(next)
  }

  const search = useQuery(
    orpc.productsAPI.listProductsAuthorizedAPI.queryOptions({
      input: {
        workspaceId,
        name: debouncedKeyword.trim() || undefined,
        page,
        perPage: PAGE_SIZE,
      },
      enabled: open && Boolean(workspaceId),
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    }),
  )

  // The chosen product's name, which may not be on the page the search shows.
  const selected = useQuery(
    orpc.productsAPI.listProductsAuthorizedAPI.queryOptions({
      input: { workspaceId, ids: value ? [value] : undefined, perPage: 1 },
      enabled: Boolean(value) && Boolean(workspaceId),
      refetchOnWindowFocus: false,
    }),
  )

  const selectedProduct = selected.data?.data.find(
    (product) => product.id === value,
  )
  const pageCount = search.data?.pageCount ?? 0

  const choose = (productId: string) => {
    onChange(productId === value ? null : productId)
    setOpen(false)
  }

  // A saved product that no longer exists (deleted) or cannot be read keeps its
  // id on screen rather than pretending the condition is empty.
  const selectedLabel = selectedProduct?.name ?? value ?? placeholder

  return (
    <div className="flex items-center gap-1.5">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              className="min-w-0 flex-1 justify-between font-normal"
              type="button"
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2">
                {selectedProduct && (
                  <ProductThumbnail
                    imageUrl={selectedProduct.images[0]?.url ?? null}
                  />
                )}
                <span
                  className={
                    value ? "truncate" : "truncate text-muted-foreground"
                  }
                >
                  {selected.isLoading ? tActions("loading") : selectedLabel}
                </span>
              </span>
              <ChevronsUpDown
                aria-hidden
                className="ms-2 size-4 shrink-0 opacity-50"
              />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              onValueChange={handleKeywordChange}
              placeholder={tActions("search")}
              value={keyword}
            />
            <CommandList>
              {search.isError ? (
                <div className="space-y-2 p-4 text-center text-xs">
                  <p className="text-destructive">
                    {tMessages("errorLoadingData")}
                  </p>
                  <Button
                    onClick={() => search.refetch()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {tActions("retry")}
                  </Button>
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {search.isLoading
                      ? tActions("loading")
                      : tActions("noRecordFound")}
                  </CommandEmpty>
                  <CommandGroup>
                    {(search.data?.data ?? []).map((product) => (
                      <CommandItem
                        key={product.id}
                        onSelect={() => choose(product.id)}
                        value={product.id}
                      >
                        <ProductThumbnail
                          imageUrl={product.images[0]?.url ?? null}
                        />
                        <span className="flex-1 truncate">{product.name}</span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {formatPrice(locale, product.price, product.currency)}
                        </span>
                        <Check
                          aria-hidden
                          className={
                            product.id === value
                              ? "size-4 opacity-100"
                              : "size-4 opacity-0"
                          }
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {!search.isError && pageCount > 1 && (
              <div className="flex items-center justify-between border-t p-1">
                <Button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {tActions("back")}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {page}/{pageCount}
                </span>
                <Button
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {tActions("next")}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <Button
          aria-label={tActions("clear")}
          onClick={() => onChange(null)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-4" />
        </Button>
      )}
    </div>
  )
}
