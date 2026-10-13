"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
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
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, PackageSearch, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { formatPrice } from "@/lib/format-price"
import { orpc } from "@/lib/orpc/query"

type ProductMultiSelectProps = {
  channel: ChannelType
  value: string[]
  onChange: (productIds: string[]) => void
  /** How many products may be picked; 1 makes it a plain single select. */
  max: number
  /** Ids picked elsewhere in the same message — a product can only appear once. */
  excludeIds?: string[]
}

type SendableProductOption = {
  id: string
  name: string
  imageUrl: string | null
  price: number
  currency: string
}

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 20
const NAMES_PAGE_SIZE = 50

function ProductThumbnail({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <PackageSearch aria-hidden className="size-3.5" />
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

type ProductChip =
  | { kind: "named"; option: SendableProductOption }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "unknown"; id: string }

/**
 * What a chosen product's chip shows. "Unavailable" is only ever a verdict from
 * a lookup that succeeded and did not return the product — a failed lookup
 * says nothing about it, so the chip falls back to its id instead of accusing
 * a perfectly good product.
 */
const describeChip = (props: {
  option: SendableProductOption | undefined
  id: string
  status: "pending" | "error" | "success"
}): ProductChip => {
  if (props.option) {
    return { kind: "named", option: props.option }
  }
  switch (props.status) {
    case "success":
      return { kind: "unavailable" }
    case "error":
      return { kind: "unknown", id: props.id }
    default:
      return { kind: "loading" }
  }
}

/** Why the list cannot be shown: no catalog, an unsupported channel, or a failed request. */
function PickerState(props: {
  isError: boolean
  notReadyReason: "channelUnsupported" | "catalogNotConnected" | undefined
  onRetry: () => void
  workspaceId: string
}) {
  const { isError, notReadyReason, onRetry, workspaceId } = props
  const t = useTranslations("flows.sendProducts")

  if (notReadyReason) {
    return (
      <div className="space-y-2 p-4 text-center text-xs">
        <p className="text-muted-foreground">
          {notReadyReason === "catalogNotConnected"
            ? t("catalogNotConnected")
            : t("channelUnsupported")}
        </p>
        {notReadyReason === "catalogNotConnected" && (
          <Link
            className={buttonVariants({ size: "sm", variant: "link" })}
            href={`/space/${workspaceId}/products`}
          >
            {t("openProducts")}
          </Link>
        )}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="space-y-2 p-4 text-center text-xs">
        <p className="text-destructive">{t("loadError")}</p>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          {t("retry")}
        </Button>
      </div>
    )
  }
  return null
}

export function ProductMultiSelect({
  channel,
  value,
  onChange,
  max,
  excludeIds,
}: ProductMultiSelectProps) {
  const t = useTranslations("flows.sendProducts")
  const tActions = useTranslations("actions")
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
    orpc.productsAPI.listSendableProductsAuthorizedAPI.queryOptions({
      input: {
        workspaceId,
        channel,
        keyword: debouncedKeyword.trim() || undefined,
        page,
        perPage: PAGE_SIZE,
      },
      enabled: open && Boolean(workspaceId),
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    }),
  )

  // Names for what the step already holds, which may not be on the page the
  // search shows. Keyed by the ids, so reopening the picker reuses the answer.
  const selected = useQuery(
    orpc.productsAPI.listSendableProductsAuthorizedAPI.queryOptions({
      input: {
        workspaceId,
        channel,
        productIds: value,
        perPage: NAMES_PAGE_SIZE,
      },
      enabled: value.length > 0 && Boolean(workspaceId),
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    }),
  )

  const optionById = new Map<string, SendableProductOption>(
    [...(selected.data?.data ?? []), ...(search.data?.data ?? [])].map(
      (option) => [option.id, option],
    ),
  )
  const isFull = value.length >= max
  const visibleOptions = (search.data?.data ?? []).filter(
    (option) => value.includes(option.id) || !excludeIds?.includes(option.id),
  )

  const chipLabel = (chip: ProductChip): string => {
    switch (chip.kind) {
      case "named":
        return chip.option.name
      case "unavailable":
        return t("unavailableProduct")
      case "unknown":
        return chip.id
      default:
        return t("loading")
    }
  }

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((selectedId) => selectedId !== id))
      return
    }
    if (max === 1) {
      onChange([id])
      setOpen(false)
      return
    }
    if (!isFull) {
      onChange([...value, id])
    }
  }

  const pageCount = search.data?.pageCount ?? 0
  const notReadyReason =
    search.data && !search.data.ready ? search.data.reason : undefined

  return (
    <div className="flex flex-col gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              className="w-full justify-between font-normal"
              type="button"
              variant="outline"
            >
              <span className="truncate text-muted-foreground">
                {t("selectProducts")}
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
              placeholder={t("searchProducts")}
              value={keyword}
            />
            <CommandList>
              <PickerState
                isError={search.isError}
                notReadyReason={notReadyReason}
                onRetry={() => search.refetch()}
                workspaceId={workspaceId}
              />
              {!(notReadyReason || search.isError) && (
                <>
                  <CommandEmpty>
                    {search.isLoading ? t("loading") : t("noProducts")}
                  </CommandEmpty>
                  <CommandGroup>
                    {visibleOptions.map((option) => {
                      const isSelected = value.includes(option.id)
                      return (
                        <CommandItem
                          disabled={!isSelected && isFull && max > 1}
                          key={option.id}
                          onSelect={() => toggle(option.id)}
                          value={option.id}
                        >
                          <ProductThumbnail imageUrl={option.imageUrl} />
                          <span className="flex-1 truncate">{option.name}</span>
                          <span className="shrink-0 text-muted-foreground text-xs">
                            {formatPrice(locale, option.price, option.currency)}
                          </span>
                          <Check
                            aria-hidden
                            className={
                              isSelected
                                ? "size-4 opacity-100"
                                : "size-4 opacity-0"
                            }
                          />
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {!(notReadyReason || search.isError) && pageCount > 1 && (
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

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const chip = describeChip({
              option: optionById.get(id),
              id,
              status: selected.isPlaceholderData ? "pending" : selected.status,
            })
            return (
              <li className="min-w-0 max-w-full" key={id}>
                <Badge
                  className="max-w-full gap-1.5 ps-1 pe-1"
                  variant={
                    chip.kind === "unavailable" ? "destructive" : "secondary"
                  }
                >
                  {chip.kind === "named" && (
                    <ProductThumbnail imageUrl={chip.option.imageUrl} />
                  )}
                  <span className="min-w-0 truncate">{chipLabel(chip)}</span>
                  <button
                    aria-label={t("removeProduct")}
                    className="rounded-sm opacity-70 hover:opacity-100"
                    onClick={() => toggle(id)}
                    type="button"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
