"use client"

import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2Icon, SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useState, useTransition } from "react"
import { useShop } from "./shop-provider"

const ALL = "all"

type Option = { id: string; name: string; parentId?: string | null }

/** Search by name, and narrow to a category or a vendor. */
export function ProductFilters({
  keyword,
  categoryId,
  vendorId,
  categories,
  vendors,
}: {
  keyword: string
  categoryId: string | null
  vendorId: string | null
  categories: Option[]
  vendors: Option[]
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const router = useRouter()
  const [search, setSearch] = useState(keyword)
  const [isPending, startTransition] = useTransition()

  const go = (next: {
    keyword?: string
    category?: string | null
    vendor?: string | null
  }) => {
    startTransition(() => {
      router.push(
        shop.href("", {
          q: next.keyword ?? search,
          category: next.category === undefined ? categoryId : next.category,
          vendor: next.vendor === undefined ? vendorId : next.vendor,
        }),
      )
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    go({ keyword: search.trim() })
  }

  // Sub-categories sit under their parent, indented.
  const topLevel = categories.filter((category) => !category.parentId)
  const orderedCategories = topLevel.flatMap((parent) => [
    { ...parent, depth: 0 },
    ...categories
      .filter((child) => child.parentId === parent.id)
      .map((child) => ({ ...child, depth: 1 })),
  ])

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <form className="relative flex-1" onSubmit={submit}>
        {isPending ? (
          <Loader2Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 animate-spin text-primary" />
        ) : (
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          aria-label={t("searchPlaceholder")}
          className="h-10 rounded-full bg-background pl-10 shadow-xs transition-shadow focus-visible:shadow-md"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          type="search"
          value={search}
        />
      </form>
      {orderedCategories.length > 0 ? (
        <Select
          items={[
            { value: ALL, label: t("allCategories") },
            ...orderedCategories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
          onValueChange={(value) =>
            go({ category: value === ALL ? null : String(value) })
          }
          value={categoryId ?? ALL}
        >
          <SelectTrigger
            aria-label={t("categories")}
            className="h-10 rounded-full bg-background shadow-xs sm:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
            {orderedCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <span className={category.depth ? "pl-4" : undefined}>
                  {category.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {vendors.length > 0 ? (
        <Select
          items={[
            { value: ALL, label: t("allVendors") },
            ...vendors.map((vendor) => ({
              value: vendor.id,
              label: vendor.name,
            })),
          ]}
          onValueChange={(value) =>
            go({ vendor: value === ALL ? null : String(value) })
          }
          value={vendorId ?? ALL}
        >
          <SelectTrigger
            aria-label={t("vendors")}
            className="h-10 rounded-full bg-background shadow-xs sm:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allVendors")}</SelectItem>
            {vendors.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
