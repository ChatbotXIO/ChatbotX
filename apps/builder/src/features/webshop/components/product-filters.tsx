"use client"

import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
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

  const go = (next: {
    keyword?: string
    category?: string | null
    vendor?: string | null
  }) => {
    router.push(
      shop.href("", {
        q: next.keyword ?? search,
        category: next.category === undefined ? categoryId : next.category,
        vendor: next.vendor === undefined ? vendorId : next.vendor,
      }),
    )
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
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("searchPlaceholder")}
          className="pl-9"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          type="search"
          value={search}
        />
      </form>
      {orderedCategories.length > 0 ? (
        <Select
          onValueChange={(value) =>
            go({ category: value === ALL ? null : String(value) })
          }
          value={categoryId ?? ALL}
        >
          <SelectTrigger aria-label={t("categories")} className="sm:w-48">
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
          onValueChange={(value) =>
            go({ vendor: value === ALL ? null : String(value) })
          }
          value={vendorId ?? ALL}
        >
          <SelectTrigger aria-label={t("vendors")} className="sm:w-48">
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
